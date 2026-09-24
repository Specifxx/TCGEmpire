import type { RiseAnalysis, RisePick, RiseScope } from "./rise-predictor";
import { COUNTRIES } from "./country";

// ─────────────────────────────────────────────────────────────────────────────
// A shareable, frozen copy of one Rising Cards run — the payload and its title.
// ─────────────────────────────────────────────────────────────────────────────
// Owner, 2026-09-22: "add a new admin feature that generates an actual useful
// title for rising cards, and gives a special link for public users to view a
// snapshot of the rising cards at the time of generation so they don't need
// premium."
//
// THE TITLE IS DERIVED, NOT WRITTEN, and that is the whole design. "Rising
// cards" is what the page was called and it says nothing: every run has the
// same name, so two links are indistinguishable and neither gives a reader a
// reason to open it. A useful title has to name what THIS run actually found,
// which means reading it off the numbers rather than composing prose about
// them.
//
// EVERY CLAIM BELOW IS A MEASURED QUANTITY. The generator picks an angle from
// the data and states it; it never predicts, never says a card "will" rise, and
// never invents a superlative the numbers don't support — /editorial-policy's
// "nothing here describes a process we don't actually run" applies to a
// headline exactly as it does to an article, and the underlying tool's own
// disclaimer ("a research signal, not advice") would be worthless if the title
// above it overclaimed. The strongest word used is "leads", which is a fact
// about rank order.

/** One card, flattened to what the public snapshot page draws. */
export interface RisingSnapshotPick {
  id: string;
  slug: string | null;
  displayName: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  score: number;
  priceCents: number | null;
  currency: string;
  trend7: number;
  trend30: number;
  posPct: number;
  listings: number;
  spark: number[];
  confidence: RisePick["confidence"];
}

/** Everything the public page renders. Frozen at mint time; never recomputed. */
export interface RisingSnapshotData {
  scope: RiseScope;
  /** ISO timestamp of the run this froze. */
  generatedAt: string;
  picks: RisingSnapshotPick[];
  /** Context the page shows so a reader can judge the sample, not just the list. */
  universeSize: number;
  qualifying: number;
  minPointsRequired: number;
}

// THE LIST HAS A NAME (owner, 2026-09-22: "we should call it the riftcompare
// hot 40"). A snapshot is a thing people forward, and "Rising cards snapshot"
// described the mechanism rather than naming the product — nobody shares a
// mechanism. The chart-countdown shape is the point: a reader who has never
// heard of this site still knows what a "Hot 40" is before reading a word of
// the subtitle.
//
// THE NUMBER IS THE REAL COUNT, NOT ALWAYS 40. rise-predictor caps the ranking
// at DISPLAY = 40, so a healthy run IS the Hot 40 — but a thin run (a market
// early in its price history) ranks fewer, and printing "Hot 40" above twelve
// rows would be the one kind of claim this file exists to avoid. So the name
// takes the count: forty cards make the Hot 40, twelve make the Hot 12. The
// brand reads the same and the number stays true.
export const HOT_LIST_BRAND = "RiftCompare Hot";
export function hotListName(count: number): string {
  return `${HOT_LIST_BRAND} ${count}`;
}

const MARKET_LABEL = (scope: RiseScope): string =>
  scope === "GLOBAL" ? "every market we track" : COUNTRIES[scope]?.place ?? scope;

/** Short market word for a title: "the US", "Australia", "global". */
const MARKET_SHORT = (scope: RiseScope): string =>
  scope === "GLOBAL" ? "global" : COUNTRIES[scope]?.adjective ?? scope;

/** "22 September 2026" — spelled out, because a title is read, not parsed. */
export function snapshotDateLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The generated headline.
 *
 * Angles, in order of how much they actually tell a reader — the first one the
 * data supports wins:
 *
 *   1. A REAL MOVE ALREADY UNDERWAY. The top pick is up ≥5% over 7 days: that
 *      is the most concrete thing any run can say, so it leads.
 *   2. A SET-UP, NOT A MOVE. The top pick sits in the bottom third of its own
 *      range (posPct ≤ 0.33) — the screener's actual thesis ("hasn't re-rated
 *      yet"), and worth naming when nothing has moved yet.
 *   3. BREADTH. Several picks are up over 7 days: no single card carries the
 *      run, but the direction is still a finding.
 *   4. THE BARE FACT. n cards ranked, on a date. Dull, but never wrong — and
 *      this branch is what makes the whole function safe to call on a thin run.
 *
 * `count` is always stated, because "how many" is the first thing a reader
 * wants and the one number every branch can honestly supply.
 */
export function generateRisingTitle(data: RisingSnapshotData, now = new Date()): string {
  const date = snapshotDateLabel(now);
  const market = MARKET_SHORT(data.scope);
  const n = data.picks.length;
  const top = data.picks[0];

  if (!top || n === 0) {
    // No list, so no list name — naming a "Hot 0" would be absurd, and this
    // branch exists precisely to stay honest on a run with nothing in it.
    return `Riftbound rising cards — no ranked cards on ${date}`;
  }

  const name = hotListName(n);

  const plural = n === 1 ? "card" : "cards";

  // 1. The top pick is already moving.
  if (top.trend7 >= 5) {
    return `${name}: ${top.displayName} is up ${top.trend7.toFixed(1)}% this week (${market}, ${date})`;
  }

  // 2. The top pick is cheap against its own range — the screener's own thesis.
  if (top.posPct <= 0.33) {
    return `${name}: ${top.displayName} leads ${n} Riftbound ${plural} near their range low (${market}, ${date})`;
  }

  // 3. No single leader, but breadth.
  const upCount = data.picks.filter((p) => p.trend7 > 0).length;
  if (upCount >= Math.ceil(n / 2) && upCount >= 3) {
    return `${name}: ${upCount} of ${n} cards gained ground this week (${market}, ${date})`;
  }

  // 4. Always-true fallback.
  return `${name}: ${top.displayName} tops the ${market} ranking (${date})`;
}

/** The one-line standfirst under the title. Same honesty rules. */
export function generateRisingSubtitle(data: RisingSnapshotData): string {
  return (
    `Ranked from the ${data.qualifying.toLocaleString()} most-searched priced cards in ` +
    `${MARKET_LABEL(data.scope)}, by demand and price-timing signals. ` +
    `A snapshot taken at one moment — the live screener moves daily.`
  );
}

/** RiseAnalysis → the frozen payload. Drops everything the public page doesn't draw. */
export function toSnapshotData(analysis: RiseAnalysis, scope: RiseScope, now = new Date()): RisingSnapshotData {
  return {
    scope,
    generatedAt: now.toISOString(),
    // The admin sees every ranked card; so does the snapshot. Withholding rows
    // here would make the shared link a teaser rather than the thing it claims
    // to be, and a teaser is what the Premium page already is for free users.
    picks: analysis.picks.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      setCode: p.setCode,
      collectorNumber: p.collectorNumber,
      imageThumbUrl: p.imageThumbUrl,
      score: p.score,
      priceCents: p.priceCents,
      currency: p.currency,
      trend7: p.trend7,
      trend30: p.trend30,
      posPct: p.posPct,
      listings: p.listings,
      spark: p.spark,
      confidence: p.confidence,
    })),
    universeSize: analysis.universeSize,
    qualifying: analysis.qualifying,
    minPointsRequired: analysis.minPointsRequired,
  };
}
