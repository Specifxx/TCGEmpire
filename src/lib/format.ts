// Currency + small formatting helpers. All money is stored as integer cents.

const LOCALE_FOR: Record<string, string> = { AUD: "en-AU", NZD: "en-NZ" };

// Format integer cents in the given currency (default AUD). AUD/NZD both render
// with a "$" symbol — the visible country selector disambiguates which market.
export function formatMoney(cents: number, currency: string = "AUD"): string {
  return new Intl.NumberFormat(LOCALE_FOR[currency] ?? "en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatAUD(cents: number): string {
  return formatMoney(cents, "AUD");
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
