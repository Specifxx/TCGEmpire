import { formatMoney } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Editorial intros for the COLLECTION pages: champion hubs, type/rarity/printing
// facets, domain pages, set pages, keyword pages.
// ─────────────────────────────────────────────────────────────────────────────
// The audit found these were the site's thinnest indexable surface after the
// empty card pages — champion hubs sampled at a median of 164 unique editorial
// words, with a floor of 71. A hub whose entire content is a heading and a grid
// of tiles is a directory entry, not a page, and 82 of them is a pattern.
//
// This generates 150+ words per page from the collection's OWN live data: how
// many cards are in it, how many are actually priced, the range, where the money
// is concentrated, which members are worth knowing about, and what that means
// for someone buying. It is the same discipline as the card narrative — every
// sentence is a fact about THIS collection, and anything the data doesn't
// support is simply not said.

export type CollectionMember = {
  name: string;
  priceCents: number | null;
  setCode?: string;
  rarity?: string;
  collectorNumber?: string;
};

export type CollectionKind = "champion" | "type" | "rarity" | "printing" | "domain" | "set" | "keyword";

export type CollectionInput = {
  kind: CollectionKind;
  /** Display label — "Jinx", "Legend", "Showcase", "Fury", "Origins", "Empower". */
  label: string;
  /** The currency the prices below are in, and the market they belong to. */
  currency: string;
  place: string;
  members: CollectionMember[];
  /** Distinct sets represented, when meaningful (champion and keyword hubs). */
  setCodes?: string[];
  /** Sitewide comparison point: the median price across every priced card. */
  siteMedianCents?: number | null;
};

const money = (cents: number, currency: string) => formatMoney(cents, currency);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

// How the collection is referred to in prose. Kept explicit rather than
// templated off `kind`, because "the Fury domain" and "Showcase printings" are
// different grammatical shapes and a generic phrasing reads like a mail merge.
function noun(kind: CollectionKind, label: string): { subject: string; member: string } {
  switch (kind) {
    case "champion":
      return { subject: `${label}'s card pool`, member: `${label} card` };
    case "type":
      return { subject: `Riftbound's ${label.toLowerCase()} cards`, member: `${label.toLowerCase()} card` };
    case "rarity":
      return { subject: `the ${label} rarity tier`, member: `${label.toLowerCase()} card` };
    case "printing":
      return { subject: `${label} printings`, member: `${label.toLowerCase()} printing` };
    case "domain":
      return { subject: `the ${label} domain`, member: `${label} card` };
    case "set":
      return { subject: label, member: "card" };
    case "keyword":
      return { subject: `cards with ${label}`, member: `${label} card` };
  }
}

/**
 * 150+ words of intro copy, or fewer if the collection genuinely has little to
 * say — a hub with three cards and no prices gets two honest sentences rather
 * than 150 words of padding. Returns paragraphs in reading order.
 */
export function buildCollectionNarrative(c: CollectionInput): string[] {
  const { subject, member } = noun(c.kind, c.label);
  const total = c.members.length;
  const priced = c.members.filter((m) => m.priceCents != null) as (CollectionMember & { priceCents: number })[];
  const values = priced.map((m) => m.priceCents).sort((a, b) => a - b);
  const out: string[] = [];

  if (total === 0) {
    return [
      `We have no ${member} in the database yet. This page fills in automatically as cards are imported — ` +
        `nothing here is hand-maintained.`,
    ];
  }

  // ── 1. Scale and coverage ──────────────────────────────────────────────────
  const setBit =
    c.setCodes && c.setCodes.length > 1
      ? ` spread across ${c.setCodes.length} sets (${c.setCodes.join(", ")})`
      : c.setCodes && c.setCodes.length === 1
      ? ` all from ${c.setCodes[0]}`
      : "";
  out.push(
    `RiftCompare tracks ${total} ${plural(total, member)} in ${subject}${setBit}, ` +
      (priced.length === total
        ? `and every one of them currently has a live price.`
        : priced.length === 0
        ? `though none currently has a live listing in ${c.place} — prices refresh daily and this page updates itself as stock appears.`
        : `${priced.length} of which have a live price in ${c.place} right now. The rest are tracked but not currently stocked by any store we monitor; they reappear here priced the moment one lists them.`),
  );

  if (!priced.length) {
    out.push(
      `Every card below links to its own page with its full text, its printings, and price comparison across ` +
        `Australia, New Zealand, the United States, the United Kingdom, Singapore and Canada.`,
    );
    return out;
  }

  // ── 2. The range, and where the money actually is ──────────────────────────
  const lo = values[0];
  const hi = values[values.length - 1];
  const median = values[Math.floor(values.length / 2)];
  const total_ = values.reduce((n, v) => n + v, 0);
  // How concentrated is the value? The top decile's share is the number that
  // separates "one chase card and a pile of bulk" from "uniformly mid-priced".
  const topDecileCount = Math.max(1, Math.round(values.length * 0.1));
  const topDecileShare = Math.round(
    (values.slice(-topDecileCount).reduce((n, v) => n + v, 0) / total_) * 100,
  );

  if (values.length >= 4) {
    let s =
      `Prices run from ${money(lo, c.currency)} to ${money(hi, c.currency)}, with a median of ` +
      `${money(median, c.currency)}.`;
    if (topDecileShare >= 55) {
      s +=
        ` The value is heavily concentrated: the most expensive ${topDecileCount === 1 ? "card alone accounts" : `${topDecileCount} cards account`} ` +
        `for ${topDecileShare}% of what it would cost to buy one of everything here. If you are completing this set of cards, ` +
        `that handful is the whole budget — the rest is close to bulk.`;
    } else if (topDecileShare <= 25) {
      s +=
        ` Value is spread unusually evenly — no single card dominates the cost, so completing this group is a steady ` +
        `accumulation rather than one expensive purchase.`;
    }
    out.push(s);

    if (c.siteMedianCents != null && c.siteMedianCents > 0) {
      const vs = Math.round(((median - c.siteMedianCents) / c.siteMedianCents) * 100);
      if (Math.abs(vs) >= 20) {
        out.push(
          `Against the ${money(c.siteMedianCents, c.currency)} median across every priced Riftbound card we track, ` +
            `${subject} sits ${Math.abs(vs)}% ${vs > 0 ? "above" : "below"} the market — ` +
            (vs > 0
              ? `a premium group, and one worth checking postage on before buying card by card.`
              : `which makes it one of the cheaper places to buy in bulk, where a single combined order beats paying postage per card.`),
        );
      }
    }
  } else {
    out.push(
      `The ${plural(values.length, "priced card")} here ${values.length === 1 ? "sits" : "sit"} at ` +
        `${values.length === 1 ? money(lo, c.currency) : `${money(lo, c.currency)}–${money(hi, c.currency)}`} in ${c.place}.`,
    );
  }

  // ── 3. Notable members, named ──────────────────────────────────────────────
  const byPrice = [...priced].sort((a, b) => b.priceCents - a.priceCents);
  // DEDUPE BY NAME. A collection routinely holds several printings of one card —
  // a base, an alternate art, a Signature — and they cluster at the top of the
  // price sort, so the raw top 3 read "Fury Rune at $195.73, Jhin at $190.47,
  // Fury Rune at $188.86". Naming the same card twice reads as a bug and wastes
  // one of only three slots that exist to tell a reader something new. The
  // dearest printing of each distinct card wins, which is also the one a "cards
  // to know" line should be quoting.
  const seenNames = new Set<string>();
  const dearest = byPrice.filter((m) => !seenNames.has(m.name) && seenNames.add(m.name)).slice(0, 3);
  const cheapest = byPrice[byPrice.length - 1];
  if (dearest.length >= 2) {
    out.push(
      `The cards to know: ${dearest
        .map((m) => `${m.name} at ${money(m.priceCents, c.currency)}`)
        .join(", ")}` +
        (cheapest && cheapest.priceCents < median
          ? `. At the other end, ${cheapest.name} is the cheapest way in at ${money(cheapest.priceCents, c.currency)}.`
          : `.`),
    );
  } else if (dearest.length === 1) {
    out.push(`The most expensive is ${dearest[0].name}, at ${money(dearest[0].priceCents, c.currency)}.`);
  }

  // ── 4. What a buyer should actually do with this ───────────────────────────
  const buyerAdvice: Record<CollectionKind, string> = {
    champion: `Every printing of a ${c.label} card is a separate product with its own price — a promo, an alternate art and a Signature print of the same card rarely track each other. The prices below are the cheapest live listing for each printing, compared across all six markets we cover, so building a ${c.label} deck usually means checking which market each individual card is cheapest in rather than buying the whole list from one shop.`,
    type: `${c.label} cards are bought for play far more often than for collection, which means condition matters less than price: a lightly played copy plays identically behind a sleeve. Sorting by delivered cost rather than sticker price is worth doing here — postage regularly outweighs the card on anything at the cheap end.`,
    rarity: `Rarity sets the pull rate, not the price. Plenty of ${c.label.toLowerCase()} cards here trade below cards two tiers under them, because demand comes from whether a card is played, not from what is printed on it. The prices below are what stores actually charge today.`,
    printing: `${c.label} printings are collector products: mechanically identical to the base card, priced entirely on scarcity and looks. If you want the card to play with, the base printing is on each card's own page and is almost always cheaper. If you want this one, the comparison below is the cheapest live listing in each market.`,
    domain: `Domain decides what a card can go in, which is why ${c.label} prices move with the ${c.label} decks that are winning rather than with the rest of the set. Cards below are priced from the cheapest live listing across all six markets we track.`,
    set: `Buying a set card by card and buying sealed are different questions — the box EV calculator answers the second, and the prices below answer the first. Both use the same daily price data.`,
    keyword: `Cards sharing a keyword tend to be bought together, because they are what a deck built around that mechanic actually needs. Prices below are the cheapest live listing for each, so a whole shopping list can be costed in one pass rather than card by card.`,
  };
  out.push(buyerAdvice[c.kind]);

  return out;
}

/** Word count of the generated intro — used by tests and the audit. */
export function collectionWordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}
