// The product page's own facts, its data-led paragraphs and its FAQ. Pure: the
// product (getPokemonProduct) and, for the comparisons, the US catalogue the
// grid pages already share (getPokemonCatalog("US"), null when that read
// failed). Nothing here reads a database, a cookie or the clock; the page
// passes `now`, so a test can pin every sentence.
//
// WHY sentences built one fact at a time: product pages are the shape AdSense
// called low-value before (docs/pokemon/README.md §6), and the audit masks
// numbers and names (scripts/adsense-audit.ts templateWords), so one sentence
// filled with different figures on 160 pages reads as one page. Each block
// here appears only when the fact behind it exists, and its shape follows the
// data (where the product ranks among its set's kinds, whether TCGplayer lists
// it the same day as its set, which markets hold a listing) rather than a
// fixed template. Nothing is padded: a product with few facts gets few blocks.
//
// Copy rules (tests/pokemon-copy.test.ts, docs/pokemon/README.md): listings,
// never sales; item price, postage extra; "as of {date}", never "today";
// release dates are always what TCGplayer lists; a market or source is named
// only when it holds a row for this product.

import { COUNTRIES, COUNTRY_LIST, type Country } from "../country";
import { formatMoney } from "../format";
import { offerStock } from "../sealed-offers";
import { allBoards, listingLabel } from "./board";
import { daysBetween, formatDay, kindNoun, listJoin, possessive, sourceWord } from "./format";
import { kindInfo, type PkKind } from "./kinds";
import { perPackCents } from "./packs";
import { lowestPerPackByKind } from "./set-facts";
import { PER_PACK_KINDS, RECENT_SETS, asOfLabel, formatPerPack, isHalfBox, recentReleasedSets } from "./value";
import type { PkCatalog, PkListingSource, PkProductDetail, PkTile } from "./types";

/** History sentences wait for this many daily points (Phase 2 backfill brings them sooner). */
export const HISTORY_MIN_POINTS = 30;

export interface PkMarketFact {
  market: Country;
  /** Cheapest OPEN listing in the market's own currency, null when none. */
  listing: { cents: number; currency: string; source: PkListingSource; label: string } | null;
  /** An open eBay listing is among this market's rows. */
  ebay: boolean;
  /** TCGplayer's market price in this market's currency, ≈ outside the US. */
  reference: { cents: number; currency: string; converted: boolean } | null;
}

/** One kind's lowest price per pack in a set, at its cheapest US listing. */
export interface PkPerPackRow {
  kind: PkKind;
  slug: string;
  name: string;
  cents: number;
  perPackCents: number;
  isThis: boolean;
}

/** The same kind in one recent set: its lowest price per pack, at the cheapest US listing. */
export interface PkSameKindRow {
  setSlug: string;
  setName: string;
  slug: string;
  name: string;
  cents: number;
  perPackCents: number;
  isThis: boolean;
}

export interface ProductFacts {
  slug: string;
  name: string;
  kind: PkKind;
  set: { slug: string; name: string; releasedOn: string | null } | null;
  presale: boolean;
  releasedOn: string | null;
  packCount: number | null;
  packCountFrom: "contents" | "name" | null;
  /** "as of 1 Oct 2026": the newest row this product has, null without rows. */
  asOf: string | null;
  /** The cheapest OPEN US listing, and its price per pack when the count is known. */
  us: { cents: number; currency: string; source: PkListingSource; perPackCents: number | null } | null;
  /** Every market, in the site's market order. */
  markets: PkMarketFact[];
  /** Markets other than the US holding an open eBay listing. */
  ebayMarkets: Country[];
  /** The set's per-pack kinds at their lowest US price per pack, this product in its kind's place; null without the catalogue. */
  setPerPack: PkPerPackRow[] | null;
  /**
   * This kind across the newest released sets (US), each set's lowest per pack.
   * This product is added when it is not one of them: "older" when its set is
   * outside the window, "variant" when another product of its kind is lower
   * per pack in its set.
   */
  sameKind: { rows: PkSameKindRow[]; window: number; added: "older" | "variant" | null } | null;
  /** Calendar days from the set's listed date to the product's (negative: earlier). */
  daysAfterSet: number | null;
  /** Only with HISTORY_MIN_POINTS or more daily points. */
  history: { points: number; first: string; last: string; low: { cents: number; day: string }; high: { cents: number; day: string }; lastCents: number } | null;
}

export interface ProseBlock {
  id: "pack-math" | "set-per-pack" | "same-kind" | "markets" | "timeline" | "history";
  text: string;
}

const money = (cents: number, currency: string) => formatMoney(cents, currency);
const placeOf = (m: Country) => COUNTRIES[m].place;
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The group a product is compared within: a Pokémon Center ETB against other Pokémon Center ETBs. */
const comparable = (kind: PkKind): boolean => (PER_PACK_KINDS as readonly string[]).includes(kind);

export function productFacts(p: PkProductDetail, usCatalog: PkCatalog | null, now: Date | number): ProductFacts {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const boards = allBoards(p.name, p.offers, { page: `/pokemon/sealed/${p.slug}`, surface: "product", now: nowMs });

  const markets: PkMarketFact[] = COUNTRY_LIST.map(({ code }) => {
    const b = boards[code];
    const ref = b.references.find((r) => r.source === "tcgplayer_market");
    const open = b.listings.filter((l) => offerStock(l, nowMs) === "open");
    return {
      market: code,
      listing: b.headline
        ? { cents: b.headline.priceCents, currency: b.currency, source: b.headline.source, label: listingLabel(b.headline.source, code) }
        : null,
      ebay: open.some((l) => l.source === "ebay"),
      reference: ref ? { cents: ref.priceCents, currency: b.currency, converted: ref.converted } : null,
    };
  });

  const usListing = markets.find((m) => m.market === "US")?.listing ?? null;
  const us = usListing
    ? { cents: usListing.cents, currency: usListing.currency, source: usListing.source, perPackCents: perPackCents(usListing.cents, p.packCount) }
    : null;

  const newest = p.offers.reduce<string | null>((acc, o) => (!acc || o.checkedAt > acc ? o.checkedAt : acc), null);

  let daysAfterSet: number | null = null;
  if (p.releasedOn && p.set?.releasedOn) daysAfterSet = daysBetween(p.set.releasedOn, p.releasedOn);

  const pts = p.history;
  let history: ProductFacts["history"] = null;
  if (pts.length >= HISTORY_MIN_POINTS) {
    let low = pts[0];
    let high = pts[0];
    for (const pt of pts) {
      if (pt.cents < low.cents) low = pt;
      if (pt.cents > high.cents) high = pt;
    }
    history = {
      points: pts.length,
      first: pts[0].day,
      last: pts[pts.length - 1].day,
      low: { cents: low.cents, day: low.day },
      high: { cents: high.cents, day: high.day },
      lastCents: pts[pts.length - 1].cents,
    };
  }

  const thisPerPack = us?.perPackCents ?? null;
  const self = (t: { slug: string }) => t.slug === p.slug;

  // The set's kinds per pack, each at its lowest per pack (never its cheapest
  // listing, which may have no pack count: see lowestPerPackByKind). Pre-orders
  // compare with pre-orders: a released product against its set's released
  // kinds, a pre-order against the rest of its pre-order set.
  let setPerPack: PkPerPackRow[] | null = null;
  if (usCatalog && p.set && comparable(p.kind) && thisPerPack != null && us) {
    const setTiles = usCatalog.tiles.filter((t) => t.setSlug === p.set?.slug && t.presale === p.presale);
    const cheapest = lowestPerPackByKind(setTiles, { includePresale: p.presale });
    const rows: PkPerPackRow[] = [];
    for (const k of PER_PACK_KINDS) {
      if (k === p.kind) {
        rows.push({ kind: k, slug: p.slug, name: p.name, cents: us.cents, perPackCents: thisPerPack, isThis: true });
        continue;
      }
      const t = cheapest[k];
      if (t && t.perPackCents != null && t.lowCents != null) {
        rows.push({ kind: k, slug: t.slug, name: t.name, cents: t.lowCents, perPackCents: t.perPackCents, isThis: false });
      }
    }
    setPerPack = rows.length >= 2 ? rows.sort((a, b) => a.perPackCents - b.perPackCents || a.name.localeCompare(b.name)) : null;
  }

  // The same kind across the newest released sets: each set's lowest per pack
  // of the kind (a half box never stands for a box), and this product added
  // when it is not one of them. This product's own row always carries its own
  // figures, so the paragraph never quotes two prices for it; a pre-order is
  // never ranked against released products.
  let sameKind: ProductFacts["sameKind"] = null;
  if (usCatalog && comparable(p.kind) && !isHalfBox(p)) {
    const recent = recentReleasedSets(usCatalog, today, RECENT_SETS);
    const rows: PkSameKindRow[] = [];
    for (const s of recent) {
      const t: PkTile | undefined = lowestPerPackByKind(usCatalog.tiles.filter((x) => x.setSlug === s.slug && !self(x)))[p.kind];
      if (t && t.perPackCents != null && t.lowCents != null) {
        rows.push({ setSlug: s.slug, setName: s.name, slug: t.slug, name: t.name, cents: t.lowCents, perPackCents: t.perPackCents, isThis: false });
      }
    }
    // This product replaces its set's row when it is at least as low per pack,
    // and joins the table beside it otherwise.
    if (us && thisPerPack != null && p.set && !p.presale) {
      const mine: PkSameKindRow = { setSlug: p.set.slug, setName: p.set.name, slug: p.slug, name: p.name, cents: us.cents, perPackCents: thisPerPack, isThis: true };
      const at = rows.findIndex((r) => r.setSlug === p.set?.slug);
      if (at >= 0 && thisPerPack <= rows[at].perPackCents) rows[at] = mine;
      else rows.push(mine);
    }
    const mine = rows.find((r) => r.isThis);
    const added: "older" | "variant" | null = !mine
      ? null
      : !recent.some((s) => s.slug === mine.setSlug)
        ? "older"
        : rows.some((r) => !r.isThis && r.setSlug === mine.setSlug)
          ? "variant"
          : null;
    sameKind = rows.length >= 2 ? { rows, window: recent.length, added } : null;
  }

  return {
    slug: p.slug,
    name: p.name,
    kind: p.kind,
    set: p.set ? { slug: p.set.slug, name: p.set.name, releasedOn: p.set.releasedOn } : null,
    presale: p.presale,
    releasedOn: p.releasedOn,
    packCount: p.packCount,
    packCountFrom: p.packCount != null ? p.packCountFrom : null,
    asOf: asOfLabel(newest),
    us,
    markets,
    ebayMarkets: markets.filter((m) => m.ebay && m.market !== "US").map((m) => m.market),
    setPerPack,
    sameKind,
    daysAfterSet,
    history,
  };
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const ORDINAL = ["", "", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ordinalLowest = (rank: number, of: number): string =>
  rank === 1 ? "the lowest" : rank === of ? "the highest" : `the ${ORDINAL[rank] ?? `${rank}th`} lowest of ${countWord(of)}`;

function perPackOf(r: { perPackCents: number }, currency = "USD") {
  return formatPerPack(r.perPackCents, currency);
}

/** "TCGplayer lists 16 Sep 2026 as its release date, …": the one release-date sentence, attributed. */
function releaseSentence(f: ProductFacts): string | null {
  const day = formatDay(f.releasedOn);
  if (!day) return null;
  let rel = "";
  if (f.daysAfterSet != null && f.set) {
    const d = f.daysAfterSet;
    rel =
      d === 0
        ? `, the same date it lists for ${f.set.name}`
        : `, ${Math.abs(d)} ${Math.abs(d) === 1 ? "day" : "days"} ${d > 0 ? "after" : "before"} the date it lists for ${f.set.name}`;
  }
  return `${f.presale ? "A pre-order: " : ""}TCGplayer lists ${day} as its release date${rel}.`;
}

export function productProse(f: ProductFacts): ProseBlock[] {
  const out: ProseBlock[] = [];
  const kind = kindInfo(f.kind);
  const asOf = f.asOf ? `, ${f.asOf}` : "";

  if (f.packCount != null) {
    const from = f.packCountFrom === "name" ? "counted from the product type in its name" : "from its contents list";
    const first = `Holds ${f.packCount} booster ${f.packCount === 1 ? "pack" : "packs"} (${from}).`;
    const second = f.us
      ? f.us.perPackCents != null
        ? ` At the cheapest US ${f.presale ? "pre-order " : ""}listing, ${money(f.us.cents, f.us.currency)} ${sourceWord(f.us.source)}${asOf}, that is ${formatPerPack(f.us.perPackCents, f.us.currency)}.`
        : ""
      : ` With no open US listing${asOf}, there is no US price per pack to show.`;
    out.push({ id: "pack-math", text: first + second });
  }

  if (f.setPerPack && f.set) {
    const rows = f.setPerPack;
    const at = rows.findIndex((r) => r.isThis);
    const others = rows.filter((r) => !r.isThis);
    const nounOf = (r: PkPerPackRow) => kindNoun(kindInfo(r.kind));
    const setName = f.set.name;
    const scope = f.presale ? `${possessive(setName)} pre-orders` : `${possessive(setName)} sealed kinds with a known pack count`;
    let text: string;
    if (at === 0) {
      const list = listJoin(others.map((r) => `the ${nounOf(r)} at ${perPackOf(r)}`));
      text = `Per pack, it is the lowest of ${scope} at their cheapest US listings: ${list}.`;
    } else if (at === rows.length - 1) {
      const low = rows[0];
      text =
        `Per pack, it is the highest of ${scope}: the ${nounOf(low)} (${low.name}) comes to ${perPackOf(low)} at its cheapest US listing` +
        (others.length > 1 ? `, and ${listJoin(others.slice(1).map((r) => `the ${nounOf(r)} ${perPackOf(r)}`))}.` : ".");
    } else {
      const low = rows[0];
      const high = rows[rows.length - 1];
      text = `Per pack, it sits between ${possessive(setName)} ${nounOf(low)} at ${perPackOf(low)} and its ${nounOf(high)} at ${perPackOf(high)}, all at their cheapest US listings.`;
    }
    out.push({ id: "set-per-pack", text });
  }

  if (f.sameKind) {
    const { rows, window, added } = f.sameKind;
    const sorted = [...rows].sort((a, b) => a.perPackCents - b.perPackCents);
    const plural = kindNoun(kind, 2);
    const scope = `the ${plural} of the ${countWord(window)} newest released sets`;
    const me = sorted.findIndex((r) => r.isThis);
    let text: string;
    if (me >= 0) {
      const mine = sorted[me];
      const low = sorted[0];
      text =
        `Against ${scope}, each at its cheapest US listing${added === "older" ? " (its own set is older than those)" : ""}, ` +
        `its ${perPackOf(mine)} is ${ordinalLowest(me + 1, sorted.length)}` +
        (me === 0 ? "." : `; the lowest is ${possessive(low.setName)} at ${perPackOf(low)}.`);
    } else {
      text = `For comparison, ${scope} run from ${perPackOf(sorted[0])} (${sorted[0].setName}) to ${perPackOf(sorted[sorted.length - 1])} (${sorted[sorted.length - 1].setName}) at their cheapest US listings.`;
    }
    out.push({ id: "same-kind", text });
  }

  const markets = marketsSentence(f);
  if (markets) out.push({ id: "markets", text: markets });

  const release = releaseSentence(f);
  if (release) out.push({ id: "timeline", text: release });

  if (f.history) {
    const h = f.history;
    out.push({
      id: "history",
      text:
        `Over ${h.points} daily readings from ${formatDay(h.first)} to ${formatDay(h.last)}, TCGplayer's market price for it ranged from ` +
        `${money(h.low.cents, "USD")} (${formatDay(h.low.day)}) to ${money(h.high.cents, "USD")} (${formatDay(h.high.day)}), and was ${money(h.lastCents, "USD")} at the last reading.`,
    });
  }
  return out;
}

/** Markets by name, each only as far as its rows go. The US is the pack-math block's. */
function marketsSentence(f: ProductFacts): string | null {
  const others = f.markets.filter((m) => m.market !== "US" && m.market !== "SG");
  const listed = others.filter((m) => m.listing);
  const unlisted = others.filter((m) => !m.listing);
  const sg = f.markets.find((m) => m.market === "SG");
  const parts: string[] = [];

  if (listed.length) {
    const [first, ...rest] = listed;
    const l = first.listing as NonNullable<PkMarketFact["listing"]>;
    const what = l.source === "ebay" ? "matching eBay listing" : `listing on ${l.label}`;
    let s = `In ${placeOf(first.market)} the cheapest ${what} we track is ${money(l.cents, l.currency)}`;
    for (const m of rest) {
      const x = m.listing as NonNullable<PkMarketFact["listing"]>;
      s += `; in ${placeOf(m.market)}, ${money(x.cents, x.currency)} ${sourceWord(x.source)}`;
    }
    if (unlisted.length) {
      s += `; in ${listJoin(unlisted.map((m) => placeOf(m.market)))} we have no tracked listing, and the eBay search on this page covers ${unlisted.length === 1 ? "it" : "them"}`;
    }
    parts.push(`${s}${f.asOf ? ` (${f.asOf})` : ""}.`);
  } else if (unlisted.length) {
    parts.push(
      `Outside the United States we have no tracked listing for it${f.asOf ? ` ${f.asOf}` : ""}; the eBay search on this page covers ${listJoin(unlisted.map((m) => placeOf(m.market)))}.`,
    );
  }
  if (!f.us && listed.length) parts.unshift(`We have no open US listing for it${f.asOf ? ` ${f.asOf}` : ""}.`);
  if (sg) {
    parts.push(
      sg.reference
        ? `In Singapore we track no listings and show TCGplayer's market price converted (≈) as a reference: ${money(sg.reference.cents, sg.reference.currency)}.`
        : "In Singapore we track no listings.",
    );
  }
  return parts.length ? parts.map(capital).join(" ") : null;
}

export interface FaqItem {
  q: string;
  a: string;
}

/** Only questions this product's data answers. The visible FAQ and its JSON-LD both render this one array. */
export function productFaq(f: ProductFacts): FaqItem[] {
  const out: FaqItem[] = [];
  if (f.packCount != null) {
    out.push({
      q: `How many booster packs are in the ${f.name}?`,
      a:
        `${f.packCount} booster ${f.packCount === 1 ? "pack" : "packs"}, ` +
        (f.packCountFrom === "name"
          ? "counted from the product type in its name, since TCGplayer publishes no contents list for it."
          : "counted from the contents list TCGplayer publishes for it."),
    });
  }
  if (f.us) {
    out.push({
      q: `What is the cheapest ${f.name} listing you track in the United States?`,
      a:
        `${money(f.us.cents, f.us.currency)} ${sourceWord(f.us.source)}` +
        (f.us.perPackCents != null ? ` (${formatPerPack(f.us.perPackCents, f.us.currency)})` : "") +
        `, item price, postage extra${f.asOf ? `, ${f.asOf}` : ""}.`,
    });
  }
  const day = formatDay(f.releasedOn);
  if (day) {
    out.push({
      q: f.presale ? `When does the ${f.name} come out?` : `When did the ${f.name} come out?`,
      a: `TCGplayer lists ${day} as its release date.${f.presale ? " Listings for it are pre-orders." : ""}`,
    });
  }
  const listed = f.markets.filter((m) => m.listing);
  if (listed.length) {
    const unlisted = f.markets.filter((m) => !m.listing);
    out.push({
      q: `Which markets have a tracked listing for the ${f.name}?`,
      a:
        `${f.asOf ? `${capital(f.asOf)}: ` : ""}${listJoin(listed.map((m) => `${placeOf(m.market)} (${(m.listing as NonNullable<PkMarketFact["listing"]>).label})`))}.` +
        (unlisted.length ? ` We have no tracked listing in ${listJoin(unlisted.map((m) => placeOf(m.market)))}; the eBay search on this page covers every market.` : ""),
    });
  }
  return out;
}
