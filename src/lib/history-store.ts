// Reads the daily PriceHistory export published by scripts/export-history.ts
// to the orphan `data` branch of this repo (see DECISIONS.md, "History off
// Neon") — served over jsDelivr's GitHub-backed CDN
// (cdn.jsdelivr.net/gh/<owner>/<repo>@data/...), never Postgres.
//
// This is the ONLY place any request-time code should read history data. It
// never imports dbHistory, never imports Prisma, and every function here
// fails to `null`/`[]` exactly like the Postgres reads it replaces did — a
// CDN miss or a network hiccup degrades a chart to empty, never to a
// database connection.
//
// WHY A BRANCH REF, NOT A SHA-PINNED URL: SHA pins would need a
// request-time lookup of "today's SHA" from somewhere — which, if that
// somewhere is Postgres, reintroduces exactly the read this module exists to
// avoid. A branch ref is simpler and costs a bounded, known staleness
// instead: jsDelivr caches a branch URL for up to 12h, and the branch itself
// is pushed once a day, so a chart can lag the true daily snapshot by up to
// ~36h in the worst case (just missed a cache refresh right before a push).
// That is still a large improvement on the weekly cadence this replaces, and
// every reader below has its own day-scoped cache on top, so a chart cannot
// contradict itself mid-request even if the CDN origin updates between two
// reads of the same page render.
const HISTORY_DATA_REPO = process.env.HISTORY_DATA_REPO ?? "Specifxx/TCGEmpire";
const HISTORY_DATA_BASE_URL =
  process.env.HISTORY_DATA_BASE_URL ?? `https://cdn.jsdelivr.net/gh/${HISTORY_DATA_REPO}@data`;

const FETCH_TIMEOUT_MS = 8_000;

export type SeriesPoint = [number, number]; // [daysSinceEpochUTC, usdCents]
export type CardSeries = { p: SeriesPoint[] };
export type HistoryWindow = { days: number[]; cards: Record<string, (number | null)[]> };
export type HistoryRecords = {
  freshest: number;
  cards: Record<string, { hi: number; hiDay: number; lo: number; loDay: number; n: number; now: number | null }>;
};
export type HistoryMeta = { format: number; updated: string; freshest: number; cards: number };

// Bare fetch, no Next.js cache participation (`cache: "no-store"`) — the
// caller wraps this in cachedOrDirect/unstable_cache with its OWN
// day-scoped key, which is the only cache that matters here. A cached
// `fetch()` inside a page-tree component would risk exactly the rule-5
// revalidate-inversion bug documented at the top of src/lib/db.ts (an inner
// TTL lower than the page's own silently governs the whole route segment) —
// this function is deliberately dumb so that can never happen from here.
async function fetchHistoryJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${HISTORY_DATA_BASE_URL}/${path}`, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getCardSeries(cardId: string): Promise<CardSeries | null> {
  return fetchHistoryJson<CardSeries>(`cards/${encodeURIComponent(cardId)}.json`);
}

export function getWindow(days: 35 | 120): Promise<HistoryWindow | null> {
  return fetchHistoryJson<HistoryWindow>(`window-${days}.json`);
}

export function getRecords(): Promise<HistoryRecords | null> {
  return fetchHistoryJson<HistoryRecords>("records.json");
}

export function getHistoryMeta(): Promise<HistoryMeta | null> {
  return fetchHistoryJson<HistoryMeta>("meta.json");
}

const MS_PER_DAY = 86_400_000;

/** Day-index (as scripts/export-history.ts writes it) back to a real Date. */
export function dayIndexToDate(dayIndex: number): Date {
  return new Date(dayIndex * MS_PER_DAY);
}
