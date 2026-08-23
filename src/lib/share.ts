// Public share links for a collection (/c/<token>) and a marketplace listing
// (/l/<token>), plus the post text a seller pastes into a trading group.
//
// WHY THESE EXIST. Riftbound trading happens in Discord and Facebook groups, not
// on price sites. A collection or a listing that can only be seen by signing in
// cannot travel there, so the site is absent from the exact conversation where a
// trade gets made. A link that unfurls with the card art and the price puts us in
// that conversation for free, every time somebody shares one.
//
// ── TWO RULES THIS FILE ENFORCES, BOTH LEARNED THE HARD WAY ELSEWHERE ───────
// 1. A share token is a CAPABILITY, not an identifier. Anyone holding the URL
//    sees the page — there is no second check — so the token must be
//    unguessable, must not be derived from the row id, and rotating it must
//    genuinely revoke every link already posted. Once a URL is pasted into a
//    public channel, rotation is the only revocation that works.
// 2. The public projections below select fields EXPLICITLY. Passing a whole
//    Prisma row to a public page is how private data leaks: CollectionCard
//    carries costBasisCents (what the owner paid), which drives the Premium P&L
//    view and must never appear on a page anyone can open. Selecting by name
//    means a future column is invisible here until somebody deliberately adds
//    it, instead of being published the moment it is created.
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { cardTileSelect } from "./cards";
import { pickPrice, currencyOf, type Country } from "./country";
import { CONDITION_MULTIPLIER } from "./constants";
import { SITE_URL } from "./site";
import { cardDisplayName } from "./card-name";
import { cardHref } from "./card-url";
import { formatMoney } from "./format";
import type { CardTileData } from "@/components/CardTile";

/**
 * 16 bytes of CSPRNG entropy, base64url.
 *
 * randomUUID() would have been the obvious choice (three other files here use
 * it), but a UUID is instantly recognisable as one and invites being tried
 * against other endpoints. This is the same 128 bits with no structure to read
 * into it, and it is URL-safe without escaping — which matters because these
 * strings get pasted into chat clients that mangle anything needing encoding.
 */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Tokens are opaque; reject anything that cannot be one before hitting the DB. */
export function isShareToken(v: string | undefined | null): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

const condMult = (condition: string) => CONDITION_MULTIPLIER[condition] ?? 1;

// ── Collections ─────────────────────────────────────────────────────────────

export type SharedHolding = {
  card: CardTileData;
  condition: string;
  isFoil: boolean;
  quantity: number;
  /** Per-copy value in the viewing market, condition-adjusted. null = unpriced. */
  unitCents: number | null;
};

export type SharedCollection = {
  ownerName: string;
  holdings: SharedHolding[];
  totalCents: number;
  /** Copies owned, counting quantity — not distinct cards. */
  totalCopies: number;
  distinctCards: number;
  currency: string;
  country: Country;
};

/**
 * Turn on sharing for an account, or return the existing link.
 *
 * Idempotent by design: a "Share" button that mints a NEW token every click
 * would silently break the link the user shared thirty seconds ago. Rotation is
 * a separate, explicit action.
 */
export async function enableCollectionShare(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { collectionShareId: true } });
  if (existing?.collectionShareId) return existing.collectionShareId;
  const token = newShareToken();
  await prisma.user.update({ where: { id: userId }, data: { collectionShareId: token } });
  return token;
}

/** Mint a fresh token, invalidating every link already posted. */
export async function rotateCollectionShare(userId: string): Promise<string> {
  const token = newShareToken();
  await prisma.user.update({ where: { id: userId }, data: { collectionShareId: token } });
  return token;
}

/** Turn sharing off entirely. The public page 404s immediately afterwards. */
export async function disableCollectionShare(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { collectionShareId: null } });
}

/**
 * The public projection of a shared collection.
 *
 * Returns null for an unknown/rotated token so the caller can 404 — never a
 * partial or empty-but-valid page, which would confirm the token exists.
 *
 * NOTE ON WHAT IS ABSENT: no costBasisCents, no profit/loss, no note field, no
 * email, no purchase dates. A shared collection answers "what do you own and
 * what is it worth today" — nothing about what it cost, which is the owner's
 * business and is Premium-gated even for the owner.
 */
export async function getSharedCollection(token: string, country: Country): Promise<SharedCollection | null> {
  if (!isShareToken(token)) return null;
  const owner = await prisma.user.findUnique({
    where: { collectionShareId: token },
    select: { id: true, displayName: true },
  });
  if (!owner) return null;

  const rows = await prisma.collectionCard.findMany({
    where: { userId: owner.id },
    // Explicit, not `include` — see the file header. `note` is intentionally
    // excluded too: it is free text the owner wrote for themselves.
    select: {
      condition: true,
      isFoil: true,
      quantity: true,
      card: { select: cardTileSelect(country) },
    },
  });

  const currency = currencyOf(country);
  let totalCents = 0;
  let totalCopies = 0;
  const holdings: SharedHolding[] = rows.map((r) => {
    const card = r.card as unknown as CardTileData;
    const market = pickPrice(card, country);
    const unitCents = market != null ? Math.round(market * condMult(r.condition)) : null;
    totalCents += (unitCents ?? 0) * r.quantity;
    totalCopies += r.quantity;
    return { card, condition: r.condition, isFoil: r.isFoil, quantity: r.quantity, unitCents };
  });
  // Most valuable first: a shared collection is browsed, not searched, so the
  // cards worth looking at belong at the top.
  holdings.sort((a, b) => (b.unitCents ?? 0) * b.quantity - (a.unitCents ?? 0) * a.quantity);

  return {
    ownerName: owner.displayName,
    holdings,
    totalCents,
    totalCopies,
    distinctCards: rows.length,
    currency,
    country,
  };
}

// ── Marketplace listings ────────────────────────────────────────────────────

/**
 * Get (or lazily mint) a listing's share token.
 *
 * Lazy rather than minted at creation time so existing rows need no backfill
 * migration and a seller who never shares never carries a token. Only the
 * listing's OWNER may call this — the caller checks that; this function
 * deliberately does not, so it can also be used by an admin tool later.
 */
export async function ensureListingShare(listingId: string): Promise<string | null> {
  const row = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { shareId: true },
  });
  if (!row) return null;
  if (row.shareId) return row.shareId;
  const token = newShareToken();
  await prisma.marketplaceListing.update({ where: { id: listingId }, data: { shareId: token } });
  return token;
}

export type SharedListing = {
  id: string;
  card: CardTileData;
  condition: string;
  isFoil: boolean;
  priceCents: number;
  quantity: number;
  currency: string;
  country: string;
  status: string;
  sellerName: string;
  shopName: string | null;
  /** Cheapest tracked STORE price for the same card in the same market, or null. */
  marketCents: number | null;
};

export async function getSharedListing(token: string): Promise<SharedListing | null> {
  if (!isShareToken(token)) return null;
  const l = await prisma.marketplaceListing.findUnique({
    where: { shareId: token },
    select: {
      id: true,
      condition: true,
      isFoil: true,
      priceCents: true,
      quantity: true,
      currency: true,
      country: true,
      status: true,
      cardId: true,
      seller: { select: { displayName: true, sellerProfile: { select: { shopName: true } } } },
    },
  });
  // A REMOVED listing is gone, not merely inactive — its share page must 404
  // rather than render a dead price. PAUSED and SOLD_OUT still render, clearly
  // labelled: a link in a Discord channel outlives the listing's availability,
  // and "this sold" is a far better landing than a 404 for someone who followed
  // it. The page shows the card either way, so the visit is never wasted.
  if (!l || l.status === "REMOVED") return null;

  const card = await prisma.card.findUnique({
    where: { id: l.cardId },
    select: cardTileSelect(l.country as Country),
  });
  if (!card) return null;
  const tile = card as unknown as CardTileData;

  return {
    id: l.id,
    card: tile,
    condition: l.condition,
    isFoil: l.isFoil,
    priceCents: l.priceCents,
    quantity: l.quantity,
    currency: l.currency,
    country: l.country,
    status: l.status,
    sellerName: l.seller.displayName,
    shopName: l.seller.sellerProfile?.shopName ?? null,
    marketCents: pickPrice(tile, l.country as Country),
  };
}

// ── Post text ───────────────────────────────────────────────────────────────

export const shareUrlForCollection = (token: string) => `${SITE_URL}/c/${token}`;
export const shareUrlForListing = (token: string) => `${SITE_URL}/l/${token}`;

/**
 * The copy-paste post for a trading group.
 *
 * Plain text on purpose — no markdown emphasis, no embeds. Discord, Facebook
 * groups, Reddit and WhatsApp each render markdown differently or not at all,
 * and a post that arrives with stray asterisks in it reads as spam. The one
 * formatting choice is a leading line-per-fact layout, which survives every
 * client intact.
 *
 * The comparison line is the reason to use ours over typing it by hand: "$18
 * (stores from $24)" is a selling point the seller would otherwise have to look
 * up themselves, and it is the number only we can supply.
 */
export function listingPostText(l: {
  cardName: string;
  cardSetCode: string;
  cardCollectorNumber: string;
  condition: string;
  isFoil: boolean;
  priceCents: number;
  quantity: number;
  currency: string;
  marketCents: number | null;
  url: string;
}): string {
  const price = formatMoney(l.priceCents, l.currency);
  const lines = [
    `${l.cardName} (${l.cardSetCode} ${l.cardCollectorNumber})${l.isFoil ? " — Foil" : ""}`,
    `${price} · ${l.condition}${l.quantity > 1 ? ` · ${l.quantity} available` : ""}`,
  ];
  // Only claim a saving when there is one. A "cheaper than stores" line on a
  // listing that is dearer than every store is the kind of detail that gets a
  // seller called out in the channel, and us blamed for writing it.
  if (l.marketCents != null && l.marketCents > l.priceCents) {
    const pct = Math.round(((l.marketCents - l.priceCents) / l.marketCents) * 100);
    lines.push(`${pct}% under the cheapest store price (${formatMoney(l.marketCents, l.currency)})`);
  } else if (l.marketCents != null) {
    lines.push(`Cheapest store price right now: ${formatMoney(l.marketCents, l.currency)}`);
  }
  lines.push(l.url);
  return lines.join("\n");
}

/** The same idea for a whole collection — a "here's my binder" post. */
export function collectionPostText(c: {
  ownerName: string;
  distinctCards: number;
  totalCopies: number;
  totalCents: number;
  currency: string;
  top: { name: string; card: CardTileData; unitCents: number | null }[];
  url: string;
}): string {
  const lines = [
    `${c.ownerName}'s Riftbound collection — ${c.distinctCards} card${c.distinctCards === 1 ? "" : "s"}` +
      `${c.totalCopies !== c.distinctCards ? ` (${c.totalCopies} copies)` : ""}, ${formatMoney(c.totalCents, c.currency)} at today's prices`,
  ];
  for (const t of c.top.slice(0, 3)) {
    lines.push(`· ${cardDisplayName(t.name, t.card)}${t.unitCents != null ? ` — ${formatMoney(t.unitCents, c.currency)}` : ""}`);
  }
  lines.push(c.url);
  return lines.join("\n");
}

/** Absolute card URL, for post text that names a specific card. */
export const absoluteCardUrl = (card: Parameters<typeof cardHref>[0]) => `${SITE_URL}${cardHref(card)}`;
