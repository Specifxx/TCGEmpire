// DAILY STREAKS (owner, 2026-11-26: "the daily check-in should just be like one ticket ... It compounds. Like, every consecutive
// day gives you more and more tickets"). DECISIONS.md, 2026-11-26 "Compounding daily streaks, and member rewards".
//
// One rule, shared by the giveaways (lib/giveaway.ts, from the rounds after December 2026) and member rewards (lib/loyalty.ts):
// the first day of a streak is worth 1, the second 2, the third 3 ... up to STREAK_CAP a day. Missing a Sydney day starts the
// streak again at 1. The cap keeps one long streak from swamping everyone else (a 60-day round's perfect streak is 555, not 1,830).
//
// Pure: no database, no node built-ins, so the pages, the client islands, the API and the tests share it.

export const STREAK_CAP = 10;

/** What day `n` of a streak (1-based) is worth. */
export function streakDayPoints(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(Math.floor(n), STREAK_CAP);
}

function dayNumber(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/** Each check-in day (YYYY-MM-DD, any order, duplicates ignored) with its place in its streak, oldest first. */
export function streakRuns(days: string[]): { day: string; n: number; points: number }[] {
  const uniq = [...new Set(days)].map((d) => ({ d, k: dayNumber(d) })).filter((x): x is { d: string; k: number } => x.k !== null);
  uniq.sort((a, b) => a.k - b.k);
  const out: { day: string; n: number; points: number }[] = [];
  let prev: number | null = null;
  let n = 0;
  for (const { d, k } of uniq) {
    n = prev !== null && k === prev + 1 ? n + 1 : 1;
    prev = k;
    out.push({ day: d, n, points: streakDayPoints(n) });
  }
  return out;
}

/** Total streak points for a set of check-in days. */
export function streakPoints(days: string[]): number {
  return streakRuns(days).reduce((s, r) => s + r.points, 0);
}

/** The current streak: consecutive days ending today, or yesterday when today is not checked in yet. */
export function currentStreak(days: string[], today: string): number {
  const t = dayNumber(today);
  if (t === null) return 0;
  const set = new Set(days.map(dayNumber).filter((k): k is number => k !== null));
  let k = set.has(t) ? t : t - 1;
  let n = 0;
  while (set.has(k)) {
    n++;
    k--;
  }
  return n;
}

/** What a check-in today is (or was) worth, and what tomorrow's will be if the streak holds. */
export function streakOutlook(days: string[], today: string): { streak: number; checkedInToday: boolean; today: number; tomorrow: number } {
  const checkedInToday = days.includes(today);
  const streak = currentStreak(days, today);
  const todayN = checkedInToday ? streak : streak + 1;
  return { streak, checkedInToday, today: streakDayPoints(todayN), tomorrow: streakDayPoints(todayN + 1) };
}
