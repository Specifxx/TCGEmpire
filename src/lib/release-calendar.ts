import { SETS } from "./constants";

// ─────────────────────────────────────────────────────────────────────────────
// THE RIFTBOUND RELEASE CALENDAR — every release Riot has announced, in order.
//
// This exists because the release page used to BE a set: /radiance-countdown was
// a hand-written Radiance page, exactly like /vendetta-countdown was a
// hand-written Vendetta page before it. Each one answered the highest-intent
// query in the niche ("when does <set> come out") for a few months, then rotted
// on release day and had to be replaced by hand — a new route, a new redirect,
// a dozen internal links repointed, and a window in between where the site's
// answer to "when is the next set" was a page about a set that had already
// shipped.
//
// So the page is now /release-dates and it names no set. It reads this list,
// splits it at today's date, counts down to the first thing still ahead, and
// tabulates the rest. Adding a set means adding a row here; RELEASE DAY ITSELF
// NEEDS NO EDIT AT ALL — Radiance moves from "next up" into the released table
// on 23 Oct 2026, and Legacy becomes the countdown, on its own.
//
// EVERY FACT HERE IS SOURCED, and the sources are our own already-published,
// already-checked write-ups rather than a re-derivation:
//   • dates, card counts and champions for Radiance onward — Riot's product and
//     set rundown of 4 August 2026, written up in /blog/riftbound-2027-set-roadmap;
//   • the historical order and card counts — /guides/riftbound-sets-in-order.
// Nothing is guessed. Where Riot never published a street date (Origins through
// Unleashed) the row says so instead of inventing one — see `date: null` below.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseEntry {
  /** Set name exactly as Riot publishes it. */
  name: string;
  /** SETS code, when the set exists in our catalogue and has its own page. */
  code?: string;
  /**
   * ISO yyyy-mm-dd street date. `null` means Riot never published one — true of
   * every set before Vendetta, and stated plainly on the page rather than
   * papered over with a guess.
   */
  date: string | null;
  /**
   * A release WINDOW for something announced without a day yet ("Q3 2027").
   * Window-only entries always sort as upcoming: a placeholder slot gets a real
   * date long before it ships, so one still sitting here dateless has not
   * happened. Never set this together with `date`.
   */
  window?: string;
  /** Base-set card count — the denominator printed on the cards themselves. */
  cards?: number;
  /** True when the count is Riot's "around N" rather than a confirmed total. */
  approxCards?: boolean;
  /** Champion Legends confirmed for a set that hasn't shipped yet. */
  champions?: string[];
  /** Where pre-orders for this set can be compared, while it is still upcoming. */
  preordersHref?: string;
  /** One sourced line on what this release actually is. */
  note: string;
}

/** Canonical release ORDER. The array's order is part of the contract — see splitCalendar(). */
export const RELEASES: ReleaseEntry[] = [
  {
    name: "Origins",
    code: "OGN",
    date: null,
    cards: 298,
    note: "The launch set, and still the largest — 298 base cards, plus 54 Showcase alternate printings on top.",
  },
  {
    name: "Origins: Proving Grounds",
    code: "OGS",
    date: null,
    cards: 24,
    note: "A 24-card companion set that followed Origins closely — by far the smallest Riftbound release.",
  },
  {
    name: "Spirit Forged",
    code: "SFD",
    date: null,
    cards: 221,
    note: "221 base cards, plus 66 Showcase printings.",
  },
  {
    name: "Unleashed",
    code: "UNL",
    date: null,
    cards: 219,
    note: "219 base cards, plus 61 Showcase printings.",
  },
  {
    name: "Vendetta",
    code: "VEN",
    date: "2026-07-31",
    cards: 166,
    note: "Introduced Empower, Flow and Burn, and was the first Riftbound set to launch worldwide in English and Simplified Chinese simultaneously.",
  },
  {
    name: "Radiance",
    code: "RAD",
    date: "2026-10-23",
    cards: 180,
    approxCards: true,
    champions: ["Seraphine", "Evelynn", "Ekko", "Ziggs", "Jarvan IV"],
    preordersHref: "/radiance-preorders",
    note: "Riot's Set 5. A step up in size from Vendetta, with five champion Legends who have no Riftbound card yet.",
  },
  {
    name: "Legacy",
    date: "2027-01-29",
    cards: 346,
    approxCards: true,
    note: "Riot's Set 6 — the largest set announced so far, the first designed specifically for draft, and the one that changes pack composition (a common slot becomes a Legend-or-Battlefield slot).",
  },
  {
    name: "Legacy boxed decks",
    date: null,
    window: "February 2027",
    note: "Four boxed decks built around Legacy champions. A product, not a set — no new card numbering of its own announced.",
  },
  {
    name: "The Reckoning",
    date: "2027-04-30",
    cards: 264,
    approxCards: true,
    note: "Riot's Set 7, built around League of Legends' biggest champions.",
  },
  {
    name: "Set 8",
    date: null,
    window: "Q3 2027",
    note: "A placeholder slot on Riot's calendar — no name, champions or theme announced.",
  },
  {
    name: "Set 9",
    date: null,
    window: "Q4 2027",
    note: "A placeholder slot on Riot's calendar — no name, champions or theme announced.",
  },
];

/**
 * Riot's home time zone, and the assumption behind every countdown on the site.
 *
 * RIOT HAS NEVER PUBLISHED AN HOUR for a Riftbound street date — checked against
 * Vendetta's 31 Jul 2026 launch as well as Radiance's announcement. A physical
 * TCG's in-store availability is set by each retailer and distributor, not by one
 * global clock-hour the way a digital unlock would be. Absent a confirmed hour we
 * assume midnight Pacific, the convention most digital-adjacent product drops
 * use, and the page LABELS it as an assumption rather than presenting it as a
 * fact. Computing it from the zone (instead of hard-coding "07:00Z", as the
 * Radiance page did) is what makes it survive daylight saving: 23 Oct 2026 is
 * PDT and lands at 07:00Z, 29 Jan 2027 is PST and lands at 08:00Z.
 */
const RELEASE_TZ = "America/Los_Angeles";

/** How far `tz`'s wall clock is ahead of UTC at a given instant, in ms. */
function tzOffsetMs(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const f = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // hour can format as "24" for midnight in some ICU versions — normalise.
  const asUtc = Date.UTC(f("year"), f("month") - 1, f("day"), f("hour") % 24, f("minute"), f("second"));
  return asUtc - at;
}

/**
 * The assumed release MOMENT for an ISO date — midnight in Riot's time zone,
 * returned as a UTC instant. Returns null for a date we don't have.
 */
export function assumedStreetInstant(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const wall = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two passes. The first offset is sampled at UTC midnight rather than local
  // midnight, which only disagrees within a few hours of a DST boundary;
  // re-sampling at the corrected instant settles it.
  let at = wall - tzOffsetMs(RELEASE_TZ, wall);
  at = wall - tzOffsetMs(RELEASE_TZ, at);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/** "23 October 2026" — the form used everywhere on the site. */
export function releaseDateLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const at = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(at));
}

/** What a row should show in a "Release" column, dated or not. */
export function releaseWhenLabel(entry: ReleaseEntry): string {
  return releaseDateLabel(entry.date) ?? entry.window ?? "Date never published";
}

/** Index of the first row Riot gave a real street date to. Everything before it is history. */
const FIRST_DATED = RELEASES.findIndex((r) => r.date != null);

/**
 * Has this release actually happened, as of `now`?
 *
 * Judged PER ROW, not by slicing the array at the first future date. Slicing
 * looks simpler and is wrong: the calendar contains window-only placeholders
 * ("Q3 2027", the February 2027 boxed decks) sitting between dated sets, and a
 * slice would make one of those a wall — every set after it would keep reading
 * as upcoming for years after it shipped, because the placeholder ahead of it
 * never resolves.
 *
 * The three cases:
 *   • a window-only row is NEVER out. A placeholder slot gets a real date well
 *     before it ships, so one still sitting here dateless has not happened —
 *     even once its window is in the past.
 *   • a dated row is out once its date has passed.
 *   • an undated, window-less row is historical: Riot didn't publish street
 *     dates before Vendetta, so anything positioned ahead of the first dated row
 *     is a set that has long since released. That is a statement about when we
 *     started having dates at all, not a guess at the date itself.
 */
function isOut(entry: ReleaseEntry, index: number, at: number): boolean {
  if (entry.window) return false;
  if (entry.date) {
    const t = Date.parse(`${entry.date}T00:00:00Z`);
    return !Number.isNaN(t) && t <= at;
  }
  return FIRST_DATED >= 0 && index < FIRST_DATED;
}

/**
 * Split the calendar at `now` into what is out and what is still coming. Both
 * halves keep the canonical order.
 *
 * Takes `now` so the roll-forward is testable without waiting for October, and
 * so no module-level constant freezes the answer for a long-running server.
 */
export function splitCalendar(now: Date = new Date()): { released: ReleaseEntry[]; upcoming: ReleaseEntry[] } {
  const at = now.getTime();
  const released: ReleaseEntry[] = [];
  const upcoming: ReleaseEntry[] = [];
  RELEASES.forEach((entry, i) => (isOut(entry, i, at) ? released : upcoming).push(entry));
  return { released, upcoming };
}

/**
 * The next release we can actually count down to — the first upcoming entry with
 * a real date. Undefined once nothing dated is left, which the page handles by
 * dropping the countdown rather than showing a broken one.
 */
export function nextDatedRelease(now: Date = new Date()): ReleaseEntry | undefined {
  return splitCalendar(now).upcoming.find((r) => assumedStreetInstant(r.date) != null);
}

/** The most recent release that is actually out. */
export function latestRelease(now: Date = new Date()): ReleaseEntry | undefined {
  const { released } = splitCalendar(now);
  return released[released.length - 1];
}

/** Our own set page for an entry, when the set is in the catalogue. */
export function releaseHref(entry: ReleaseEntry): string | null {
  if (!entry.code) return null;
  const slug = SETS.find((s) => s.code === entry.code)?.slug;
  return slug ? `/sets/${slug}` : null;
}

/** "~180 cards" / "166 cards" / null when the count isn't published. */
export function cardCountLabel(entry: ReleaseEntry): string | null {
  if (entry.cards == null) return null;
  return `${entry.approxCards ? "~" : ""}${entry.cards} cards`;
}
