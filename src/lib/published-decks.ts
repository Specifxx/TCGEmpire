// The public deck library (2026-09-26): pure rules shared by the publish API,
// the admin import, the library and deck pages. Client-safe (no Prisma).
//
// NOT the meta decks removed on 2026-09-12 — those were hand-copied from other
// sites. Every deck here is one a player published, or the owner imported,
// attributed to them. Nothing is seeded.

import { COUNTRY_LIST, pickPrice, type Country } from "./country";

export const DECK_TITLE_MIN = 4;
export const DECK_TITLE_MAX = 80;
export const DECK_DESC_MAX = 1000;
/** A published deck must resolve at least this many card copies (Legend included). */
export const DECK_MIN_CARDS = 25;
/** Lines the list may leave unmatched and still publish. */
export const DECK_MAX_UNMATCHED = 3;
/** Per account: at most this many publishes in 24 hours (DB-counted, global). */
export const DECK_DAILY_LIMIT = 10;
/** Cache tag for /deck's "Start from a published deck" list; publish/hide revalidate it. */
export const PUBLISHED_DECKS_TAG = "published-decks";

export type MarketTotals = Partial<Record<Country, number | null>>;

export interface PricedCard {
  lowestPriceCents: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
  lowestPriceCentsEu?: number | null;
}

/**
 * A deck's total in every market: Σ qty × the card's cheapest price there
 * (pickPrice — the per-market cheapest columns the deck pricer and every card
 * tile read). A market where any card has no price is `null`, never a partial
 * sum passed off as the deck's cost.
 */
export function deckTotals(lines: { qty: number; card: PricedCard | null | undefined }[]): MarketTotals {
  const out: MarketTotals = {};
  for (const { code } of COUNTRY_LIST) {
    let total = 0;
    let complete = lines.length > 0;
    for (const l of lines) {
      const p = l.card ? pickPrice(l.card, code) : null;
      if (p == null) {
        complete = false;
        break;
      }
      total += p * l.qty;
    }
    out[code] = complete ? total : null;
  }
  return out;
}

export type PriceBand = "all" | "u50" | "u100" | "200plus";
export const PRICE_BANDS: { value: PriceBand; label: string }[] = [
  { value: "all", label: "Any price" },
  { value: "u50", label: "Under $50" },
  { value: "u100", label: "Under $100" },
  { value: "200plus", label: "$200+" },
];

/** Whether a total (minor units of the viewer's currency) falls in a band. Unpriced decks only match "all". */
export function inPriceBand(totalCents: number | null | undefined, band: PriceBand): boolean {
  if (band === "all") return true;
  if (totalCents == null) return false;
  if (band === "u50") return totalCents < 5000;
  if (band === "u100") return totalCents < 10000;
  return totalCents >= 20000;
}

/** Percentage change from the published total to now, or null when either side is missing. */
export function changeSincePublished(published: number | null | undefined, now: number | null | undefined): number | null {
  if (published == null || now == null || published <= 0) return null;
  return Math.round(((now - published) / published) * 1000) / 10;
}

/** TCGplayer Mass Entry: one "qty Name" per line. */
export function massEntry(lines: { qty: number; name: string }[]): string {
  return lines.map((l) => `${l.qty} ${l.name}`).join("\n");
}

/** The deck's two main domains, most copies first; Colorless never counts. */
export function deckDomains(cards: { qty: number; domain: string }[]): string[] {
  const n = new Map<string, number>();
  for (const c of cards) {
    for (const d of c.domain.split(/[,/]/).map((s) => s.trim()).filter(Boolean)) {
      if (/^colou?rless$/i.test(d)) continue;
      n.set(d, (n.get(d) ?? 0) + c.qty);
    }
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([d]) => d);
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

/** "/decks/<title>-<short id>" — the id suffix keeps two same-titled decks apart. */
export function deckSlug(title: string, id: string): string {
  const base = slugify(title) || "deck";
  return `${base}-${id.slice(-6).toLowerCase()}`;
}

/** The champion slug a legend's name files under, e.g. "Jinx, Loose Cannon" → "jinx". */
export function legendSlugFrom(legendName: string, championSlug?: string | null): string {
  return championSlug || slugify(legendName.split(",")[0]) || "legend";
}

export type PublishCheck = { ok: true; title: string; description: string | null } | { ok: false; error: string };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|ru|shop|store|co)\b)/i;

/**
 * Title/description checks — basic spam protection on top of the rate limit
 * and the per-account daily cap. No links anywhere (the commonest spam), no
 * shouting, no one character repeated to pad a field.
 */
export function checkPublishText(titleRaw: unknown, descRaw: unknown): PublishCheck {
  const title = typeof titleRaw === "string" ? titleRaw.trim().replace(/\s+/g, " ") : "";
  const description = typeof descRaw === "string" ? descRaw.trim() : "";
  if (title.length < DECK_TITLE_MIN || title.length > DECK_TITLE_MAX) {
    return { ok: false, error: `Give the deck a title of ${DECK_TITLE_MIN}–${DECK_TITLE_MAX} characters.` };
  }
  if (description.length > DECK_DESC_MAX) return { ok: false, error: `Keep the description under ${DECK_DESC_MAX} characters.` };
  if (LINK.test(title) || LINK.test(description)) return { ok: false, error: "Links aren't allowed in deck titles or descriptions." };
  if (/(.)\1{9,}/.test(title + description)) return { ok: false, error: "That text looks like padding — please write it out." };
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) return { ok: false, error: "Please don't write the title in capitals." };
  return { ok: true, title, description: description || null };
}

/** The viewer's figure from a totals object (client side). */
export function totalFor(totals: MarketTotals | null | undefined, country: Country): number | null {
  return totals?.[country] ?? null;
}
