// CardTrader as the EU price source.
//
// WHY THIS EXISTS, AND WHY IT IS NOT CARDMARKET. Cardmarket is the marketplace
// EU buyers actually name, and lib/cardmarket.ts already implements it — gated
// OFF behind a legal flag, because Cardmarket's terms require their "prior
// written agreement" before their prices may be presented on another site, and
// their API has been closed to new applicants (confirmed 2026-08-24 on
// help.cardmarket.com: "Currently, we are not accepting applications"). That
// gate is a business signature, not a coding problem, and nothing here changes
// it. CardTrader is the same SHAPE of source — a pan-European marketplace with
// many competing sellers, rather than one shop's stock list — with a documented
// API that is open to any account holder.
//
// WHY A MARKETPLACE AND NOT MORE SHOPS. A previous pass added Germany as a
// priced market and reverted it the same day because real store coverage was
// too thin (see country.ts's header). Re-measured 2026-08-24, that verdict
// still holds: of the German Shopify shops that attempt was built on, Battle
// Bear listed 0 Riftbound singles, Card-Knights 2 (both out of stock) and Poke
// Paradies 1 (out of stock); the best EU shop found, ManaMarket, carries ~200
// singles from ONE set. CardTrader's Unleashed expansion alone returns 43,696
// live listings across 313 distinct cards, 73% of them from EU sellers, with
// 299 of those 313 cards having at least one EU Near-Mint listing. That is the
// difference between a market worth building and one that gets reverted again.
//
// EGRESS. One expansion's marketplace response is ~32MB, so this is import-time
// only (the daily cron), never per-request, and it streams straight into a
// per-card minimum rather than being retained. Do not call this from a page.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CARDTRADER_RETAILER } from "@/lib/constants";
import { USD_TO } from "@/lib/fx";

const API = "https://api.cardtrader.com/api/v2";

// Riftbound is game_id 22 (verified against /games on 2026-08-24).
const RIFTBOUND_GAME_ID = 22;

// Sellers whose country counts as "the EU market" for pricing purposes. This is
// the shipping-reality set, not the political one: EEA/Schengen neighbours are
// included because they ship into the EU on the same terms a member state does,
// which is what a buyer comparing prices actually cares about. Mirrors the EU_ISO
// set in country.ts, plus CH/NO/IS which that set also treats as EU-adjacent.
const EU_SELLER_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "FI", "FR", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "CH", "NO", "IS",
]);

// Conditions good enough to quote as the headline "from" price. Anything below
// Slightly Played is a materially different product and would make the site look
// like it found a bargain that isn't one — the same reasoning behind the
// condition handling in the Shopify importer.
const ACCEPTABLE_CONDITIONS = new Set(["Near Mint", "Slightly Played"]);

// English only. The catalogue is the English printing; CardTrader also lists
// zh-CN and fr copies of the same collector number (35 and 27 of Unleashed's 313
// cards respectively), and those are a different product to a buyer even though
// they share a number. Including them would quietly undercut the "from" price
// with a card the visitor didn't ask for.
const LANGUAGE = "en";

export function isCardTraderEnabled(): boolean {
  return !!process.env.CARDTRADER_API_TOKEN;
}

type CtPrice = { cents?: number; currency?: string };
type CtProps = {
  collector_number?: string | null;
  condition?: string | null;
  signed?: boolean | null;
  riftbound_foil?: boolean | null;
  riftbound_language?: string | null;
  riftbound_rarity?: string | null;
};
type CtProduct = {
  id: number;
  blueprint_id: number;
  name_en?: string;
  quantity?: number;
  graded?: boolean;
  on_vacation?: boolean;
  price?: CtPrice;
  price_cents?: number;
  price_currency?: string;
  properties_hash?: CtProps;
  expansion?: { id: number; code?: string; name_en?: string };
  user?: { country_code?: string; username?: string };
};

export type CardTraderExpansion = { id: number; code: string; name: string };

async function ctFetch<T>(path: string): Promise<T | null> {
  const token = process.env.CARDTRADER_API_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Riftbound expansions on CardTrader, keyed by their code (lowercase, e.g. "unl"). */
export async function getCardTraderExpansions(): Promise<CardTraderExpansion[]> {
  const raw = await ctFetch<unknown>("/expansions");
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((x): x is { id: number; game_id: number; code?: string; name?: string } =>
      !!x && typeof x === "object" && (x as { game_id?: number }).game_id === RIFTBOUND_GAME_ID,
    )
    .map((x) => ({ id: x.id, code: (x.code ?? "").toLowerCase(), name: x.name ?? "" }))
    .filter((x) => x.code.length > 0);
}

// CardTrader quotes every price in the API ACCOUNT's display currency, not the
// seller's own and not a per-request choice (verified: ?currency=EUR and
// ?price_currency=EUR are both ignored). So the currency that comes back is
// whatever the linked CardTrader account is set to, and this converts it to EUR
// through the canonical rate table rather than trusting it to already be right.
// Set the CardTrader account's display currency to EUR to make this a no-op and
// get each EU seller's own native figure with no conversion at all.
export function toEurCents(cents: number, currency: string): number {
  const cur = (currency || "EUR").toUpperCase();
  if (cur === "EUR") return cents;
  const perUsd = USD_TO[cur];
  const eurPerUsd = USD_TO.EUR;
  if (!perUsd || !eurPerUsd) return cents;
  return Math.round((cents / perUsd) * eurPerUsd);
}

/** Normalise a CardTrader collector_number ("006", "022a") for catalogue matching. */
export function ctNumKey(n: string): string {
  const m = n.trim().match(/^0*(\d+)([a-z]*)$/i);
  return m ? m[1] + m[2].toLowerCase() : n.trim().toLowerCase();
}

/** Same normalisation for our own "006/219" / "147a/219" collector numbers. */
export function cardNumKey(collectorNumber: string): string {
  const seg = collectorNumber.split("/")[0] ?? collectorNumber;
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
  // A Signature print ("303*/298") is a different card to "303/298" and must not
  // collapse onto it — mirrors numKey() in cardmarket.ts and price-import.ts.
  return seg.includes("*") ? `${base}s` : base;
}

export type EuQuote = {
  numKey: string;
  priceEurCents: number;
  condition: string;
  isFoil: boolean;
  sellerCountry: string;
  title: string;
  blueprintId: number;
};

/**
 * Cheapest EU-seller listing per collector number for one expansion.
 *
 * Filters, in order: real stock, not graded, seller not on vacation, EU seller,
 * English, acceptable condition. Anything without a collector number (tokens and
 * a handful of unnumbered promos — 14 of Unleashed's 313) is skipped rather than
 * name-matched, because a wrong match here becomes a wrong headline price.
 */
export function cheapestEuByNumber(products: CtProduct[]): Map<string, EuQuote> {
  const best = new Map<string, EuQuote>();
  for (const p of products) {
    if (p.graded) continue;
    if (p.on_vacation) continue;
    if ((p.quantity ?? 0) < 1) continue;
    const props = p.properties_hash ?? {};
    // A hand-signed copy is a different product from the base card, and CardTrader
    // records it with this flag rather than in the collector number. Our own
    // Signature prints carry the "*" in the number instead (303*/298 -> "303s" via
    // cardNumKey), so a signed listing can never key onto its base card here — but
    // it would land in that base card's price pool if it weren't dropped, and one
    // underpriced signed copy would then quote the wrong product entirely.
    // Currently a no-op on Riftbound (Unleashed has 0 signed listings of 43,696),
    // which is exactly why it is worth pinning before that changes.
    if (props.signed === true) continue;
    const country = p.user?.country_code ?? "";
    if (!EU_SELLER_COUNTRIES.has(country)) continue;
    if ((props.riftbound_language ?? LANGUAGE) !== LANGUAGE) continue;
    const condition = props.condition ?? "";
    if (!ACCEPTABLE_CONDITIONS.has(condition)) continue;
    const rawNum = props.collector_number;
    if (!rawNum) continue;
    const cents = p.price_cents ?? p.price?.cents;
    if (typeof cents !== "number" || cents <= 0) continue;

    const eur = toEurCents(cents, p.price_currency ?? p.price?.currency ?? "EUR");
    const key = ctNumKey(String(rawNum));
    const prev = best.get(key);
    if (!prev || eur < prev.priceEurCents) {
      best.set(key, {
        numKey: key,
        priceEurCents: eur,
        condition,
        isFoil: !!props.riftbound_foil,
        sellerCountry: country,
        title: p.name_en ?? "",
        blueprintId: p.blueprint_id,
      });
    }
  }
  return best;
}

/** Live marketplace listings for one expansion. */
export async function fetchExpansionProducts(expansionId: number): Promise<CtProduct[]> {
  // The response is a map of blueprint_id -> listings[], not a flat array.
  const raw = await ctFetch<Record<string, CtProduct[]>>(
    `/marketplace/products?expansion_id=${expansionId}`,
  );
  if (!raw || typeof raw !== "object") return [];
  return Object.values(raw).flat();
}

/** Public product URL for a CardTrader blueprint (outbound link for the price row). */
export function cardTraderUrl(blueprintId: number): string {
  return `https://www.cardtrader.com/cards/${blueprintId}`;
}

export type CardTraderRow = Prisma.RetailerPriceCreateManyInput;

/**
 * Build EU RetailerPrice rows for every catalogue card CardTrader can price.
 * Pure read + transform: writes nothing, so it is safe to run as a dry run.
 */
export async function buildCardTraderRows(opts?: { setCodes?: string[] }): Promise<CardTraderRow[]> {
  if (!isCardTraderEnabled()) return [];
  const expansions = await getCardTraderExpansions();
  if (!expansions.length) return [];

  const byCode = new Map(expansions.map((e) => [e.code, e]));
  const wanted = opts?.setCodes?.map((s) => s.toLowerCase());

  const cards = await prisma.card.findMany({
    select: { id: true, setCode: true, collectorNumber: true, name: true },
  });
  // setCode -> numKey -> cardId
  const index = new Map<string, Map<string, string>>();
  for (const c of cards) {
    const set = c.setCode.toLowerCase();
    if (!index.has(set)) index.set(set, new Map());
    index.get(set)!.set(cardNumKey(c.collectorNumber), c.id);
  }

  const rows: CardTraderRow[] = [];
  for (const [set, numMap] of index) {
    if (wanted && !wanted.includes(set)) continue;
    const exp = byCode.get(set);
    if (!exp) continue; // a set CardTrader doesn't carry
    const products = await fetchExpansionProducts(exp.id);
    if (!products.length) continue;
    for (const [numKey, quote] of cheapestEuByNumber(products)) {
      const cardId = numMap.get(numKey);
      if (!cardId) continue; // listed there, not in our catalogue
      rows.push({
        cardId,
        retailer: CARDTRADER_RETAILER,
        retailerName: "CardTrader",
        title: quote.title,
        url: cardTraderUrl(quote.blueprintId),
        condition: quote.condition,
        isFoil: quote.isFoil,
        priceCents: quote.priceEurCents,
        currency: "EUR",
        inStock: true,
        country: "EU",
      });
    }
  }
  return rows;
}

/**
 * Import pass: rebuild every CardTrader EU row. Called by the daily price import.
 *
 * Delete-then-insert, mirroring refreshCardmarketPrices(): a listing that sold out
 * simply stops appearing in the API, and an UPDATE-only pass would leave that stale
 * row behind forever, quoting a price nobody can buy. Guarded so a bad fetch keeps
 * the previous rows rather than emptying the EU market — 0 rows is far more likely
 * to mean "the API blipped" than "every EU seller sold out at once".
 */
export async function refreshCardTraderPrices(): Promise<{ skipped: boolean; written: number; reason?: string }> {
  if (!isCardTraderEnabled()) return { skipped: true, written: 0, reason: "CARDTRADER_API_TOKEN not set" };

  let rows: CardTraderRow[];
  try {
    rows = await buildCardTraderRows();
  } catch (e) {
    return { skipped: true, written: 0, reason: `fetch failed: ${(e as Error).message}` };
  }
  if (rows.length === 0) {
    console.warn("CardTrader: 0 rows built — keeping existing rows.");
    return { skipped: false, written: 0, reason: "0 rows built" };
  }

  await prisma.retailerPrice.deleteMany({ where: { retailer: CARDTRADER_RETAILER } });
  await prisma.retailerPrice.createMany({ data: rows });
  console.log(`CardTrader: wrote ${rows.length} EU rows.`);
  return { skipped: false, written: rows.length };
}
