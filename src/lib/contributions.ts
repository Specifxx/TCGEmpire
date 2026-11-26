// COMMUNITY CONTRIBUTIONS (2026-11-26, community plan move 3: "names on contributions"). Pure half: what each contribution is
// worth, the day's cap, and how the monthly Top deal hunters list is ranked. The server half is lib/contributions-server.ts.
//
// RULES THE CODE HOLDS:
// - Only a signed-in member's contribution is recorded (an anonymous vote still counts on the drop, it just earns nothing).
// - Each contribution counts once: one hot or cold vote per drop (whichever came first), one expired flag per drop, one pulse
//   answer per product, one row per pull log. Changing a vote never earns again.
// - Points: CONTRIBUTION_POINTS per kind, at most DAILY_CONTRIBUTION_CAP a Sydney day across every site. Past the cap a
//   contribution is still recorded (it counts toward "contributions") with 0 points.
// - In the open giveaway, the points made inside its window are added to the entrant's points (lib/giveaway.ts entryPoints).
//   They are free activity, so paying still never buys a better chance than a free account can have.
// - Only a chosen handle is ever shown (lib/handles.ts); an account without one is counted and never named.

export const CONTRIBUTION_KINDS = ["hot", "cold", "flag", "pulse", "pull"] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const CONTRIBUTION_POINTS: Record<ContributionKind, number> = { hot: 1, cold: 1, flag: 1, pulse: 1, pull: 3 };
/** Most points contributions can earn in one Sydney day: the same as one check-in. */
export const DAILY_CONTRIBUTION_CAP = 5;
/** How many names the monthly list shows. */
export const TOP_HUNTERS = 10;

/** Points a new contribution earns, given what the account already earned today. */
export function pointsFor(kind: ContributionKind, earnedToday: number): number {
  const room = Math.max(0, DAILY_CONTRIBUTION_CAP - Math.max(0, earnedToday));
  return Math.min(CONTRIBUTION_POINTS[kind], room);
}

/** "2026-11" for a date (UTC month: the list resets on the 1st, UTC). */
export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** The first instant of a month key and of the month after it. */
export function monthRange(key: string): { gte: Date; lt: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)) };
}

export interface HunterRow {
  handle: string;
  points: number;
  contributions: number;
  /** earliest contribution this month, for a stable tie-break */
  first: Date;
}

/** Rank the month: points, then contributions, then who started first, then the handle. */
export function rankHunters(rows: HunterRow[], top = TOP_HUNTERS): HunterRow[] {
  return [...rows]
    .filter((r) => r.contributions > 0)
    .sort((a, b) => b.points - a.points || b.contributions - a.contributions || a.first.getTime() - b.first.getTime() || (a.handle < b.handle ? -1 : 1))
    .slice(0, top);
}
