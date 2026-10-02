// A week-on-week (or 30-day) move, in the house BUYER'S-EYE colours: a drop
// is the good news (text-up, ▼), a rise is not (text-down, ▲) — the convention
// of the region-home table, the watchlist and the digest, and the reverse of
// TCGplayer/PriceCharting. So direction is never colour alone: ▲/▼ give it at
// a glance and the sr-only words say it.
//
// Once a copy of the homepage table's Change7d (that table is gone):
// tests/first-visit-ux.test.ts pins those strings inside PriceTodayTable.tsx.
export function PriceGuideChange({ pct, label = "No change data yet" }: { pct: number | null | undefined; label?: string }) {
  if (pct == null) {
    // aria-label on a role="img" dash rather than an sr-only span beside it:
    // one element a row instead of three, in a table sent twice (HTML + RSC).
    return (
      <span role="img" aria-label={label} className="text-slate-600">
        —
      </span>
    );
  }
  return (
    <span className={pct < 0 ? "text-up" : pct > 0 ? "text-down" : "text-slate-400"}>
      <span aria-hidden="true">{pct > 0 ? "▲ " : pct < 0 ? "▼ " : ""}</span>
      <span className="sr-only">{pct > 0 ? "Price up " : pct < 0 ? "Price down " : "Unchanged "}</span>
      {pct > 0 ? "+" : pct < 0 ? "−" : ""}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
