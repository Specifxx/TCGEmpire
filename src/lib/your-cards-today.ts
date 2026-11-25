// "Your cards today" (2026-11-18, retention job C): pure helpers shared by the route and the strip, so the tests can pin them.

export const TODAY_MAX = 8;
export const YCT_ARM_KEY = "yct-arm";
export const YCT_SEEN_KEY = "yct-seen"; // { [cardId]: priceCents } as of the visitor's last look at the strip
export const YCT_DAY_KEY = "yct-day"; // the Sydney-agnostic local day the eligible/shown events last fired
export const YCT_MOVED_KEY = "yct-moved"; // "1" while a watched card moved since the last visit to /watching (the bar's dot)

/** The newest distinct cards, at most TODAY_MAX (the account may watch one card in several markets). */
export function todayItems<T extends { id: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
    if (out.length >= TODAY_MAX) break;
  }
  return out;
}

/** Change since the last look: null when there is nothing to compare (first look, or no price either side). */
export function changeSince(prev: number | undefined, now: number | null): number | null {
  if (prev == null || now == null) return null;
  return now - prev;
}

/** The 50/50 arm, kept for good once drawn. `rand` is injectable for tests. */
export function armOf(stored: string | null, rand: () => number = Math.random): { arm: "on" | "off"; store: string | null } {
  if (stored === "on" || stored === "off") return { arm: stored, store: null };
  const arm = rand() < 0.5 ? "on" : "off";
  return { arm, store: arm };
}

/** An SVG polyline for a sparkline in a w×h box; "" when there are fewer than two points. */
export function sparkPath(values: number[], w = 64, h = 20): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(" ");
}
