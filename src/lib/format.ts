// Currency + small formatting helpers. All money is stored as integer cents.

// Distinct symbols so every price is unambiguous about its market (a plain "$"
// could be AUD, NZD or USD). A$ = Australia, NZ$ = New Zealand, US$ = United States,
// £ = United Kingdom.
const SYMBOL: Record<string, string> = { AUD: "A$", NZD: "NZ$", USD: "US$", GBP: "£" };

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

// Compact money for large aggregate figures (e.g. an index's market cap), e.g.
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
