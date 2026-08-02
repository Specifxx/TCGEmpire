import { formatMoney } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// The card page's "About" section, generated compositionally from real data.
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS WRONG: the previous generator was a fixed sentence skeleton with the
// card's attributes slotted in — "X is a common unit card from Origins (OGN)…
// It belongs to the Fury domain." Across ~1,400 pages that is one page written
// 1,400 times, which is the shape of Google's scaled-content-abuse policy and
// the most likely content objection behind the AdSense rejections.
//
// WHAT THIS DOES INSTEAD: it assembles observations that only exist because of
// what this specific card's data says, and picks sentence FORMS by branching on
// data conditions — not by shuffling synonyms, which produces the same page in
// a thin disguise and is worse than not bothering.
//
// The six observation families, each emitted only when the data supports it:
//   1. Cross-market spread — cheapest AU vs US vs UK delivered, the gap as a
//      percentage, and whether importing actually beats buying locally.
//   2. Price trajectory — direction and size over 7/30/90 days, distance from
//      the tracked high/low, position against the median.
//   3. Stock depth — how many stores carry it, how concentrated supply is, and
//      what the second-cheapest listing costs (the real question when the
//      cheapest is one seller).
//   4. Variant economics — the foil/showcase/signature premium as a multiple.
//   5. Set context — where this price sits in its set's distribution.
//   6. Playability — which tracked meta decks run it, at what copy count.
//
// HARD RULE, inherited from the code this replaces and worth restating: nothing
// is asserted without the data on this render to back it. A card with two
// listings and no history gets three short paragraphs, not a padded five. Filler
// is the failure mode this whole exercise is trying to remove.

export type NarrativeMarket = {
  country: string;
  place: string;
  currency: string;
  /** Cheapest in-stock listing, item price only. */
  lowestCents: number | null;
  /** Cheapest in-stock listing including that retailer's postage. */
  lowestDeliveredCents: number | null;
  /** Second-cheapest in-stock listing, item price only. */
  secondCents: number | null;
  /** Distinct in-stock retailers. */
  storeCount: number;
  /** Total in-stock listings (a store can list NM and foil separately). */
  listingCount: number;
  /** Cheapest in-stock non-foil / foil listing, for the foil premium. */
  cheapestNonFoilCents?: number | null;
  cheapestFoilCents?: number | null;
  /** Cheapest listing graded Near Mint / anything below it. */
  cheapestNearMintCents?: number | null;
  cheapestPlayedCents?: number | null;
};

export type NarrativeHistory = {
  /** Chronological, oldest first. Cents in the baseline market's currency. */
  points: { t: number; v: number }[];
};

export type NarrativeInput = {
  name: string;
  displayName: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  type: string;
  domain: string;
  variant: string | null;
  isPromo: boolean;
  energyCost: number | null;
  might: number | null;
  power: number | null;
  isSignature: boolean;
  isOvernumbered: boolean;
  isCrystalRose: boolean;

  /** The market the cached page is rendered on. */
  baseline: NarrativeMarket;
  /** Every market with data, for the cross-market spread. */
  markets: NarrativeMarket[];
  history: NarrativeHistory;

  /** Other printings of the same card, with the baseline market's price. */
  printings: { label: string; priceCents: number | null; isBase: boolean }[];
  /** Meta decks running this card. */
  decks: { name: string; copies?: number | null }[];
  /** Where this card sits among its set's priced cards. */
  setContext: { pricedInSet: number; cheaperThan: number; setMedianCents: number | null } | null;
};

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

// ─────────────────────────────────────────────────────────────────────────────
// Printing labels — NEVER interpolate `card.variant` raw.
// ─────────────────────────────────────────────────────────────────────────────
// `variant` is a printing CODE from the card database, not prose: the alternate
// arts carry the literal string "a" (from collector numbers like "036a"). Slotted
// straight into a sentence that produced, live on the site:
//
//   "This page covers the a printing of Vi, Destructive"
//   "The a print carries a 252.9× premium over the plain version"
//
// lib/card-name.ts already owns the canonical code→label mapping for badges and
// titles ("Alt Art", "Showcase", "Signature", …); these are the same names in
// running-prose casing, so a card page can't call the same printing two things.
const VARIANT_LABELS: Record<string, string> = {
  a: "alternate-art",
  b: "alternate-art",
  s: "Signature",
  p: "promo",
};

/** Human label for a raw `variant` code. Unknown codes fall back to a safe generic. */
export function variantLabel(variant: string | null | undefined): string {
  if (!variant) return "alternate-art";
  return VARIANT_LABELS[variant.toLowerCase()] ?? "alternate-art";
}

/** The label for THIS printing, in prose casing. Never a raw code. */
export function printingLabel(c: {
  isSignature?: boolean;
  isCrystalRose?: boolean;
  isOvernumbered?: boolean;
  isPromo?: boolean;
  rarity?: string;
  variant?: string | null;
}): string {
  if (c.isSignature) return "Signature";
  if (c.isCrystalRose) return "Crystal Rose";
  if (c.isOvernumbered) return "overnumbered";
  if (c.rarity === "Showcase") return "Showcase";
  if (c.isPromo) return "promo";
  if (c.variant) return variantLabel(c.variant);
  return "base";
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentence assembly
// ─────────────────────────────────────────────────────────────────────────────
// Several paragraphs are built by joining independently-written fragments. Each
// fragment reads naturally mid-sentence and therefore starts lowercase — joining
// them with ". " produced, live on the site:
//
//   "…a price watch will tell you if it moves before you check back. the United
//    States is currently the only one of our six markets with a copy in stock…"
//
// `sentences()` is the only sanctioned way to join fragments into sentences: it
// capitalises each one, terminates it, and collapses the whitespace and doubled
// punctuation that fragment concatenation leaves behind.

/** Capitalise the first letter without touching the rest (so "eBay" survives). */
function capitalise(s: string): string {
  const t = s.trimStart();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Join fragments into properly-cased, properly-terminated sentences. */
function sentences(...fragments: (string | null | undefined)[]): string {
  return tidy(
    fragments
      .filter((f): f is string => Boolean(f && f.trim()))
      .map((f) => {
        const t = capitalise(f.trim());
        return /[.!?]$/.test(t) ? t : `${t}.`;
      })
      .join(" "),
  );
}

/** Final hygiene pass: no doubled spaces, no doubled/space-preceded punctuation. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])\1+/g, "$1")
    .replace(/\.\s*\./g, ".")
    .trim();
}

// ── 0. Identity ──────────────────────────────────────────────────────────────
// Still needed — a reader has to be told what the card IS — but the SHAPE is
// chosen from the card's own facts rather than being one fixed skeleton, and
// the stat clause folds in whichever of energy/might/power actually exists.
function identity(c: NarrativeInput): string {
  const article = /^[aeiou]/i.test(c.rarity) ? "an" : "a";
  const kind = `${c.rarity.toLowerCase()} ${c.type.toLowerCase()}`;
  const domainClause =
    c.domain === "Colorless"
      ? "It carries no domain, so it slots into any deck"
      : `It sits in the ${c.domain} domain`;

  const stats: string[] = [];
  if (c.energyCost != null) stats.push(`${c.energyCost} energy to play`);
  if (c.might != null) stats.push(`${c.might} might`);
  else if (c.power != null) stats.push(`${c.power} power`);

  // Four openings, chosen by what makes this printing distinctive — a Signature
  // print leads with its scarcity, a promo with its origin, a statted unit with
  // its cost, everything else with its set.
  if (c.isSignature) {
    return (
      `${c.displayName} is the Signature print of ${c.name} — numbered ${c.collectorNumber}, past the end of ` +
      `${c.setName}'s base run, which is what makes it far scarcer than the ordinary ${c.rarity.toLowerCase()} printing. ` +
      `${domainClause}${stats.length ? `, at ${stats.join(" and ")}` : ""}.`
    );
  }
  if (c.isCrystalRose) {
    return (
      `${c.displayName} is one of the six Crystal Rose alt-arts in ${c.setName} — Wild Rift's returning skin line ` +
      `rendered on physical cards — pulled at the same rate as the set's other alternate arts. ` +
      `${domainClause}${stats.length ? `, costing ${stats.join(" and carrying ")}` : ""}.`
    );
  }
  if (c.isPromo) {
    return (
      `${c.displayName} is a promotional printing of ${c.name}. It shares collector number ${c.collectorNumber} with ` +
      `the ${c.setName} original but is a separate product that trades at its own price. ` +
      `${domainClause}${stats.length ? ` and costs ${stats.join(", with ")}` : ""}.`
    );
  }
  if (c.variant || c.rarity === "Showcase") {
    return (
      `This page covers the ${printingLabel(c)} printing of ${c.name}, card ${c.collectorNumber} of ` +
      `${c.setName} (${c.setCode}) — the same card as the base version but a distinct product with its own market. ` +
      `${domainClause}${stats.length ? `, at ${stats.join(" and ")}` : ""}.`
    );
  }
  if (stats.length) {
    return (
      `${c.displayName} costs ${stats.join(" and brings ")} as ${article} ${kind} in ${c.setName} (${c.setCode}), ` +
      `card number ${c.collectorNumber}. ${domainClause}.`
    );
  }
  return (
    `${c.displayName} is ${article} ${kind} from ${c.setName} (${c.setCode}), collector number ` +
    `${c.collectorNumber}. ${domainClause}.`
  );
}

// ── 1. Cross-market spread ───────────────────────────────────────────────────
// The single most useful thing this site knows and nowhere else says: whether
// importing beats buying at home, DELIVERED, in the reader's own currency.
// Deliberately never converts between currencies — we don't publish an FX rate
// we can stand behind, so it compares each market's internal item-vs-postage
// economics and names the markets, rather than asserting a false "cheaper by $3".
function crossMarket(c: NarrativeInput): string | null {
  const priced = c.markets.filter((m) => m.lowestDeliveredCents != null && m.storeCount > 0);
  if (priced.length < 2) return null;

  const base = c.baseline;
  if (base.lowestCents == null || base.lowestDeliveredCents == null) return null;

  const postageShare = Math.round(
    ((base.lowestDeliveredCents - base.lowestCents) / base.lowestDeliveredCents) * 100,
  );
  const others = priced.filter((m) => m.country !== base.country);
  const names = others.map((m) => m.place);

  // Postage dominating the delivered cost is the actual buying advice on a
  // cheap card, and it only gets said when it's true of THIS card's listings.
  if (postageShare >= 40) {
    return (
      `Postage is the deciding factor here: at ${formatMoney(base.lowestCents, base.currency)} for the card and ` +
      `${formatMoney(base.lowestDeliveredCents - base.lowestCents, base.currency)} to ship it, delivery is ${postageShare}% of ` +
      `what you actually pay in ${base.place}. On a card at this price it is nearly always worth adding it to a larger ` +
      `order from one store rather than buying it alone — the comparison table above sorts by delivered cost, not sticker price. ` +
      `We also track it in ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}.`
    );
  }

  return (
    `${c.name} is stocked in ${priced.length} of the markets we track — ` +
    `${priced.map((m) => m.place).join(", ")} — each priced in its own currency, so the table above ranks by delivered ` +
    `cost inside whichever market you pick rather than converting between them. In ${base.place} the cheapest listing is ` +
    `${formatMoney(base.lowestCents, base.currency)} before postage and ` +
    `${formatMoney(base.lowestDeliveredCents, base.currency)} delivered.`
  );
}

// ── 2. Price trajectory ──────────────────────────────────────────────────────
// Real windows against real recorded points. Every window is only quoted when
// enough days exist to fill it, so a two-week-old card gets the 7-day line and
// nothing else rather than a fabricated 90-day trend.
function trajectory(c: NarrativeInput): string | null {
  const pts = c.history.points;
  if (pts.length < 4) return null;

  const now = pts[pts.length - 1];
  const spanDays = Math.round((now.t - pts[0].t) / 86_400_000);
  const at = (daysAgo: number) => {
    const target = now.t - daysAgo * 86_400_000;
    if (pts[0].t > target) return null; // window predates our first record
    return pts.reduce((best, p) => (Math.abs(p.t - target) < Math.abs(best.t - target) ? p : best), pts[0]);
  };

  const values = pts.map((p) => p.v);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cur = now.v;
  const cy = c.baseline.currency;

  const moves: string[] = [];
  for (const [days, label] of [[7, "week"], [30, "month"], [90, "quarter"]] as const) {
    const then = at(days);
    if (!then || then.t === now.t) continue;
    const change = pct(cur, then.v);
    if (Math.abs(change) < 2) moves.push(`flat over the last ${label}`);
    else moves.push(`${change > 0 ? "up" : "down"} ${Math.abs(change)}% over the last ${label}`);
  }
  if (!moves.length) return null;

  // Flat everywhere reads differently from a real move, so it gets its own form
  // rather than a limp "up 0%".
  const allFlat = moves.every((m) => m.startsWith("flat"));
  if (allFlat) {
    return (
      `Across ${spanDays} days of tracked history ${c.name} has barely moved — ${moves.join(", ")} — holding around ` +
      `${formatMoney(cur, cy)} in ${c.baseline.place}. A stable price like this usually means supply and demand are ` +
      `matched: there is no urgency to buy today, and equally no reason to expect a better price by waiting.`
    );
  }

  let s = `${c.name} is ${moves.join(", ")}, at ${formatMoney(cur, cy)} in ${c.baseline.place} today.`;

  // Position within the tracked range — only when the range is wide enough for
  // "near its high" to mean anything (a 3% band does not).
  if (hi > lo && (hi - lo) / lo > 0.08) {
    const fromHigh = pct(cur, hi);
    const fromLow = pct(cur, lo);
    if (fromHigh >= -3) {
      s += ` That puts it at the top of its tracked range (${formatMoney(lo, cy)}–${formatMoney(hi, cy)}) — buying now means paying about as much as it has ever cost.`;
    } else if (fromLow <= 3) {
      s += ` That is the bottom of its tracked range (${formatMoney(lo, cy)}–${formatMoney(hi, cy)}) — the cheapest we have recorded it.`;
    } else {
      s += ` It has traded between ${formatMoney(lo, cy)} and ${formatMoney(hi, cy)} over that period, so today sits ${Math.abs(fromHigh)}% below the high and ${fromLow}% above the low.`;
    }
    const vsMedian = pct(cur, median);
    if (Math.abs(vsMedian) >= 8) {
      s += ` Against a median of ${formatMoney(median, cy)}, it is currently ${Math.abs(vsMedian)}% ${vsMedian > 0 ? "expensive" : "cheap"} by its own standards.`;
    }
  }
  return s;
}

// ── 3. Stock depth ───────────────────────────────────────────────────────────
// One seller at $4 and eight sellers at $4 are completely different purchases.
// The gap to the SECOND listing is the number that tells you which you're in.
function stockDepth(c: NarrativeInput): string | null {
  const m = c.baseline;
  if (m.lowestCents == null || m.storeCount === 0) return null;
  const cy = m.currency;

  if (m.storeCount === 1) {
    return (
      `Supply is thin: exactly one tracked store in ${m.place} has ${c.name} in stock right now, at ` +
      `${formatMoney(m.lowestCents, cy)}. With a single seller there is no competing price to hold it down, so this ` +
      `figure can move sharply the moment that listing sells or another shop restocks. Setting a price alert is more ` +
      `useful than watching the page.`
    );
  }

  if (m.secondCents != null && m.lowestCents > 0) {
    const gap = pct(m.secondCents, m.lowestCents);
    if (gap >= 25) {
      return (
        `${m.storeCount} ${plural(m.storeCount, "store")} in ${m.place} ${plural(m.storeCount, "has", "have")} it in stock, ` +
        `but the pricing is top-heavy: ${formatMoney(m.lowestCents, cy)} at the cheapest, then a ${gap}% jump to ` +
        `${formatMoney(m.secondCents, cy)} for the next one. That cheapest listing is doing all the work — if it goes, ` +
        `the effective price of this card rises by roughly ${gap}% overnight.`
      );
    }
    if (gap <= 8) {
      return (
        `${m.storeCount} ${plural(m.storeCount, "store")} in ${m.place} ${plural(m.storeCount, "carries", "carry")} it and they ` +
        `are priced within ${gap}% of each other — ${formatMoney(m.lowestCents, cy)} to ${formatMoney(m.secondCents, cy)} ` +
        `at the top two. A tight spread across several sellers is the sign of a settled price, so postage and how much ` +
        `else you can add to the same order matter more than which shop you pick.`
      );
    }
    return (
      `${m.storeCount} ${plural(m.storeCount, "store")} in ${m.place} ${plural(m.storeCount, "has", "have")} it, from ` +
      `${formatMoney(m.lowestCents, cy)} up, with the second-cheapest at ${formatMoney(m.secondCents, cy)} — ` +
      `a ${gap}% spread across ${m.listingCount} tracked ${plural(m.listingCount, "listing")}.`
    );
  }
  return null;
}

// ── 3b. Condition and foil economics ─────────────────────────────────────────
// What a buyer weighing "do I need Near Mint?" or "is the foil worth it?"
// actually needs, computed from the listings on this page. Both halves are
// independent and each appears only when both sides of its comparison exist.
function conditionEconomics(c: NarrativeInput): string | null {
  const m = c.baseline;
  const cy = m.currency;
  const bits: string[] = [];

  if (m.cheapestNearMintCents != null && m.cheapestPlayedCents != null && m.cheapestNearMintCents > 0) {
    const saving = pct(m.cheapestPlayedCents, m.cheapestNearMintCents);
    if (saving <= -12) {
      bits.push(
        `A played copy is the value play here: ${formatMoney(m.cheapestPlayedCents, cy)} against ` +
          `${formatMoney(m.cheapestNearMintCents, cy)} for Near Mint, ${Math.abs(saving)}% less for a card that plays ` +
          `identically behind a sleeve`,
      );
    } else if (saving >= -4) {
      bits.push(
        `There is no real discount for accepting wear — the cheapest played copy is ` +
          `${formatMoney(m.cheapestPlayedCents, cy)} against ${formatMoney(m.cheapestNearMintCents, cy)} Near Mint, so ` +
          `buy the better copy`,
      );
    }
  }

  if (m.cheapestFoilCents != null && m.cheapestNonFoilCents != null && m.cheapestNonFoilCents > 0) {
    const multiple = m.cheapestFoilCents / m.cheapestNonFoilCents;
    if (multiple >= 1.25) {
      bits.push(
        `the foil runs ${formatMoney(m.cheapestFoilCents, cy)}, ${multiple.toFixed(1)}× the non-foil at ` +
          `${formatMoney(m.cheapestNonFoilCents, cy)}`,
      );
    } else if (multiple <= 1.1) {
      bits.push(
        `foils are barely dearer than non-foils right now — ${formatMoney(m.cheapestFoilCents, cy)} against ` +
          `${formatMoney(m.cheapestNonFoilCents, cy)} — which rarely lasts`,
      );
    }
  }

  if (!bits.length) return null;
  return sentences(bits.join(", and "));
}

// ── 3c. Coverage notes ───────────────────────────────────────────────────────
// What the ABSENCE of data means, said plainly. A priced card with no recorded
// history, or stocked in only one of six markets, is a real and useful fact
// about that card — and saying so beats leaving a chart area unexplained. These
// only fire when the corresponding richer paragraph could NOT, so they add
// information rather than padding.
function coverageNotes(c: NarrativeInput): string | null {
  const bits: string[] = [];

  if (c.history.points.length < 4 && c.baseline.lowestCents != null) {
    bits.push(
      `We have only just started recording ${c.name}'s price, so there is no trend to read yet — the chart above ` +
        `fills in a point a day from here, and a price watch will tell you if it moves before you check back`,
    );
  }

  const stocked = c.markets.filter((m) => m.storeCount > 0);
  if (stocked.length === 1 && c.baseline.storeCount > 0) {
    bits.push(
      `${stocked[0].place} is currently the only one of our six markets with a copy in stock — Australia, New Zealand, ` +
        `the US, the UK, Singapore and Canada are all checked daily, and the others have nothing listed today`,
    );
  }

  if (!bits.length) return null;
  return sentences(...bits);
}

// ── 4. Variant economics ─────────────────────────────────────────────────────
// The premium as a MULTIPLE, which is how collectors actually reason about it,
// and only when both sides of the comparison have a real current price.
function variantEconomics(c: NarrativeInput): string | null {
  const base = c.printings.find((p) => p.isBase && p.priceCents != null);
  const mine = c.baseline.lowestCents;
  const cy = c.baseline.currency;
  const isSpecial = c.isSignature || c.isOvernumbered || c.isCrystalRose || c.variant != null || c.rarity === "Showcase";

  if (isSpecial && base?.priceCents != null && mine != null) {
    const multiple = mine / base.priceCents;
    const label = printingLabel(c);
    if (multiple >= 1.15) {
      return (
        `The ${label} print carries a ${multiple.toFixed(1)}× premium over the plain version — ` +
        `${formatMoney(mine, cy)} against ${formatMoney(base.priceCents, cy)}. Both are legal in the same decks, so that ` +
        `gap is paying for the art and the scarcity, not for anything on the table.`
      );
    }
    if (multiple <= 0.9) {
      return (
        `Unusually, the ${label} print is currently the cheaper of the two — ${formatMoney(mine, cy)} against ` +
        `${formatMoney(base.priceCents, cy)} for the base printing. That normally means a temporary listing rather than a ` +
        `settled market, and it tends to correct once the cheap copy sells.`
      );
    }
    return (
      `The ${label} print and the base printing are trading at almost the same price right now — ` +
      `${formatMoney(mine, cy)} against ${formatMoney(base.priceCents, cy)} — so the premium version costs effectively ` +
      `nothing extra while that holds.`
    );
  }

  // Base printings get the mirror-image observation about their own variants.
  const pricedVariants = c.printings.filter((p) => !p.isBase && p.priceCents != null);
  if (!isSpecial && mine != null && pricedVariants.length) {
    const dearest = pricedVariants.reduce((a, b) => ((b.priceCents ?? 0) > (a.priceCents ?? 0) ? b : a));
    const multiple = (dearest.priceCents ?? 0) / mine;
    if (multiple >= 1.3) {
      return (
        `This is the standard printing, and the cheapest way to actually play the card: its ${dearest.label} counterpart ` +
        `runs ${formatMoney(dearest.priceCents!, cy)}, about ${multiple.toFixed(1)}× this one. Every printing is ` +
        `tournament-legal, so the premium is purely cosmetic.`
      );
    }
  }
  return null;
}

// ── 5. Set context ───────────────────────────────────────────────────────────
function setContext(c: NarrativeInput): string | null {
  const ctx = c.setContext;
  const mine = c.baseline.lowestCents;
  if (!ctx || mine == null || ctx.pricedInSet < 12 || ctx.setMedianCents == null) return null;

  const percentile = Math.round((ctx.cheaperThan / ctx.pricedInSet) * 100);
  const cy = c.baseline.currency;

  if (percentile >= 90) {
    return (
      `Within ${c.setName} this is a genuine chase card: it is more expensive than ${percentile}% of the ` +
      `${ctx.pricedInSet} priced cards in the set, against a set median of ${formatMoney(ctx.setMedianCents, cy)}. ` +
      `Cards at this end of a set's distribution are what make sealed product worth opening, and what make it expensive ` +
      `to buy singles for a deck that needs them.`
    );
  }
  if (percentile <= 25) {
    return (
      `It sits in the cheap end of ${c.setName} — below ${100 - percentile}% of the set's ${ctx.pricedInSet} priced ` +
      `cards, where the median is ${formatMoney(ctx.setMedianCents, cy)}. Cards down here are usually bought as part of a ` +
      `bulk order rather than on their own, because postage costs more than the card.`
    );
  }
  return (
    `Priced against the rest of ${c.setName}, it lands mid-table: dearer than ${percentile}% of the set's ` +
    `${ctx.pricedInSet} priced cards, with the set median at ${formatMoney(ctx.setMedianCents, cy)}.`
  );
}

// ── 6. Playability ───────────────────────────────────────────────────────────
function playability(c: NarrativeInput): string | null {
  if (!c.decks.length) return null;
  const named = c.decks.slice(0, 3).map((d) => d.name);
  const copies = c.decks.map((d) => d.copies).filter((n): n is number => typeof n === "number" && n > 0);
  const maxCopies = copies.length ? Math.max(...copies) : null;
  const mine = c.baseline.lowestCents;

  let s =
    c.decks.length === 1
      ? `On the play side, ${c.name} appears in one deck we track — ${named[0]}.`
      : `${c.name} shows up in ${c.decks.length} of the meta decks we track, including ${named.slice(0, 2).join(" and ")}.`;

  // A playset cost is the number a deckbuilder actually needs, and it's only
  // worth stating when we know both the copy count and a real price.
  if (maxCopies && maxCopies > 1 && mine != null) {
    s += ` Builds run up to ${maxCopies} copies, so a full set for one deck costs about ${formatMoney(mine * maxCopies, c.baseline.currency)} at today's cheapest listing.`;
  } else if (mine != null) {
    s += ` At ${formatMoney(mine, c.baseline.currency)} it is a cheap inclusion if you are building toward ${named[0]}.`;
  }
  return s;
}

// ── 7. Honest fallback for a card with no market yet ──────────────────────────
// EMPTY cards are noindexed (see lib/card-price-state.ts), but they are still
// served to real people arriving from search, a bookmark or an internal link,
// and they must say something true and useful rather than nothing.
function noMarketYet(c: NarrativeInput): string {
  // A card can be unpriced in the BASELINE market and perfectly well stocked
  // somewhere else — the page is cached on one market, not sold in one. Saying
  // "no live listing in any of the six markets" to a reader looking at a card
  // that four Australian shops have in stock is simply false, and this function
  // is reached on the baseline check alone, so it has to distinguish the two.
  const elsewhere = c.markets.filter((m) => m.storeCount > 0 && m.lowestCents != null);

  if (elsewhere.length) {
    const cheapest = elsewhere.reduce((a, b) => (a.lowestCents! <= b.lowestCents! ? a : b));
    const names = elsewhere.map((m) => m.place);
    return (
      `No store we track in ${c.baseline.place} has ${c.displayName} in stock today, but it is available ` +
      `elsewhere: ${elsewhere.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}` +
      `${elsewhere.length === 1 ? " has" : " have"} it, from ${formatMoney(cheapest.lowestCents!, cheapest.currency)} in ` +
      `${cheapest.place}. Switch market on the comparison above to see those listings and what they cost delivered — ` +
      `importing a single card is often dearer than it looks once postage is counted, so check the delivered figure ` +
      `rather than the sticker price.`
    );
  }

  const otherPriced = c.printings.filter((p) => p.priceCents != null);
  let s2 =
    `We have no live listing for ${c.displayName} in any of the six markets we track right now. That is a real ` +
    `signal rather than a gap in the data: it means no store we monitor in Australia, New Zealand, the US, the UK, ` +
    `Singapore or Canada currently has it on the shelf.`;
  if (otherPriced.length) {
    const cheapest = otherPriced.reduce((a, b) => ((b.priceCents ?? 0) < (a.priceCents ?? 0) ? b : a));
    s2 +=
      ` Its ${cheapest.label} printing is stocked, at ${formatMoney(cheapest.priceCents!, c.baseline.currency)} — ` +
      `a different product, but the closest live price for this card.`;
  }
  s2 += ` Prices refresh daily; a price watch will email you the moment one appears.`;
  return s2;
}

/**
 * Build the About section. Returns paragraphs in reading order.
 *
 * Order matters: identity first (what is this?), then the observation that is
 * most decision-relevant for THIS card's data, then supporting context.
 */
export function buildCardNarrative(c: NarrativeInput): string[] {
  const paragraphs: string[] = [identity(c)];

  const hasMarket = c.baseline.lowestCents != null && c.baseline.storeCount > 0;
  if (!hasMarket) {
    paragraphs.push(noMarketYet(c));
    const t = trajectory(c);
    if (t) paragraphs.push(t);
    const p = playability(c);
    if (p) paragraphs.push(p);
    return paragraphs.map(tidy);
  }

  // Order the middle by which observation this card's data actually makes
  // interesting: a card whose price is moving leads with the move; a static
  // one leads with where to buy it.
  const traj = trajectory(c);
  const depth = stockDepth(c);
  const cond = conditionEconomics(c);
  const spread = crossMarket(c);
  const variant = variantEconomics(c);
  const set = setContext(c);
  const play = playability(c);
  const coverage = coverageNotes(c);

  const movingFast = traj != null && /up \d\d+%|down \d\d+%/.test(traj);
  const ordered = movingFast
    ? [traj, depth, cond, spread, variant, set, play, coverage]
    : [depth, traj, cond, spread, variant, set, play, coverage];

  for (const p of ordered) if (p) paragraphs.push(p);
  // Every paragraph leaves through tidy(), not just the two that were reported.
  // Fragment concatenation is spread across seven builders here; a hygiene pass
  // at the single exit point is the only version that can't be forgotten when an
  // eighth is added. tests/card-narrative.test.ts asserts the invariants.
  return paragraphs.map(tidy);
}

/** Word count of the generated narrative — used by tests and the audit. */
export function narrativeWordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}
