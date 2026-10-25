import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDeckList, priceableLines, resolveDeckLines, DECK_LINE_CAP, FREE_BULK_LINES } from "@/lib/deck";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { priceField } from "@/lib/country";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// The free, no-account list pricer behind /deck (which absorbed the Bulk
// Pricer on 2026-09-25): paste a decklist or a plain list of names, get each
// line matched to a card and priced at its cheapest in-stock listing.
//
// Unauthenticated, so it is rate-limited per IP — generously: a real user
// prices a list, edits it and re-prices, and /deck re-prices once when the
// market changes. Resolution is lib/deck.ts's resolveDeckLines (set + number
// scoped to the set, then exact name, then a capped name-contains fallback).
//
// Past a deck it is Premium's (2026-10-25, lib/deck.ts FREE_BULK_LINES): a
// list longer than that is priced to its first FREE_BULK_LINES card lines for
// anyone below Premium, and the response says so (`bulkLimit`) so /deck can
// offer the upgrade. Premium prices up to DECK_LINE_CAP, as everyone did before.

// Only what the /deck client uses. imageUrl stays: the preview pane shows the
// full-size art through cardImageSrc(card, { full: true }) (a self-hosted
// Signature print has no other large rendition). nameNormalized is selected
// for resolution and stripped from the response (withoutKey). Each card carries
// its per-market prices, so the client prices every line itself — no per-line
// unitPriceCents/lineCents (it never read them, and they'd go stale when the
// market changes before it re-prices).
const cardSelect = {
  id: true,
  slug: true,
  name: true,
  nameNormalized: true,
  setCode: true,
  collectorNumber: true,
  variant: true,
  isPromo: true,
  rarity: true,
  imageThumbUrl: true,
  imageUrl: true,
  lowestPriceCents: true,
  lowestPriceCentsUs: true,
  lowestPriceCentsUk: true,
  lowestPriceCentsSg: true,
  lowestPriceCentsCa: true,
  lowestPriceCentsEu: true,
} as const;

export async function POST(req: Request) {
  const rl = rateLimit(`deck-price:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const country = getCountry();
  const orderBy = [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  const parsed = priceableLines(parseDeckList(text, { plainNames: true }));
  // The session is read only for a list past the free size: a deck never pays
  // for the lookup.
  const full = parsed.length > FREE_BULK_LINES ? isPremium(await getCurrentUser(), "premium") : true;
  const bulkLimited = !full;
  const lines = bulkLimited ? parsed.slice(0, FREE_BULK_LINES) : parsed;

  let resolved;
  try {
    resolved = await resolveDeckLines(lines, (args) => prisma.card.findMany({ ...args, select: cardSelect, orderBy }));
  } catch {
    return NextResponse.json({ error: "Card prices are unavailable right now — try again in a minute." }, { status: 503 });
  }

  const items = resolved.items.map(({ line, card, fuzzy }) => ({
    raw: line.raw,
    qty: line.qty,
    name: line.name,
    card: card ? withoutKey(card) : null,
    fuzzy,
    // Whether the line named its printing (set + number); the client keeps
    // that printing when it re-shares or hands the list on.
    pinned: !!(card && line.number && !fuzzy),
  }));

  return NextResponse.json({
    items,
    truncated: lines.length > DECK_LINE_CAP,
    ...(bulkLimited ? { bulkLimit: { limit: FREE_BULK_LINES, lines: Math.min(parsed.length, DECK_LINE_CAP) } } : {}),
  });
}

function withoutKey<T extends { nameNormalized: string }>(card: T): Omit<T, "nameNormalized"> {
  const out: Partial<T> = { ...card };
  delete out.nameNormalized;
  return out as Omit<T, "nameNormalized">;
}
