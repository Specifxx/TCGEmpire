// Currency + small formatting helpers. All money is stored as integer cents.

// Distinct symbols so every price is unambiguous about its market (a plain "$"
// could be AUD, USD, SGD or CAD). A$ = Australia,
// US$ = United States, £ = United Kingdom, S$ = Singapore, C$ = Canada,
// € = the Euro reference figure shown to UK-market visitors.
// SGD was MISSING here until the CA rollout — Singapore prices were rendering as a
// bare "$" via the `?? "$"` fallback below, i.e. exactly the ambiguity this table
// exists to prevent. Added alongside CAD rather than left broken.
const SYMBOL: Record<string, string> = { AUD: "A$", USD: "US$", GBP: "£", SGD: "S$", CAD: "C$", EUR: "€" };

// Format integer cents in the given currency (default AUD), e.g. "A$12.50".
export function formatMoney(cents: number, currency: string = "AUD"): string {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${SYMBOL[currency] ?? "$"}${n}`;
}

export function formatAUD(cents: number): string {
  return formatMoney(cents, "AUD");
}

// Compact money for large aggregate figures (e.g. an index's basket value), e.g.
// "A$48.2k" or "US$1.31M". Falls back to two-decimal money under $1,000.
export function formatMoneyCompact(cents: number, currency: string = "AUD"): string {
  const sym = SYMBOL[currency] ?? "$";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `${sym}${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 1_000) return `${sym}${(dollars / 1_000).toFixed(1)}k`;
  return formatMoney(cents, currency);
}

// Parse a user-entered dollar string (e.g. "12.50") into integer cents.
export function dollarsToCents(value: string | number): number {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

// Normalise text for search: lowercase, strip punctuation/spaces. Lets "kaisa"
// match "Kai'Sa" and "jinxloosecannon" match "Jinx, Loose Cannon".
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Trim text down to a length that survives a ~160-char meta description (Google's
// SERP truncation point) without cutting mid-word. Shared by every metadata
// generator that builds a description from longer prose (card pages, blog posts)
// so they can't independently drift on the truncation rule.
export function clampText(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // BOTH branches must leave room for the "…" appended below, not just the
  // word-boundary one. A 2026-08-31 audit still found a description over the
  // cap: the word-boundary branch cuts at `lastSpace < max`, so its "+ 1 for
  // the ellipsis" always lands at or under `max` — but a string with no good
  // word boundary near the end (one long word spanning past `max * 0.6`) fell
  // through to the raw `cut`, which is already `max` chars on its own, and
  // appending "…" to that overshoots by exactly one character every time.
  // `max - 1` here closes that gap the same way the other branch already had.
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut.slice(0, max - 1)).replace(/[,;:.\s]+$/, "")}…`;
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count}${label} ago`;
  }
  return "just now";
}
