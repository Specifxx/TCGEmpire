import { TIER_COMPARISON, type TierRow } from "./TierComparisonTable";

// THE /premium COMPARISON — REAL LIMITS, FROM THE BLOG'S OWN LIST (2026-10-22,
// owner: "make the comparison table honest and specific … show actual limits
// instead of bare ✓/✕"). Supersedes the ticks-only table of 2026-10-17
// ("/premium, 70% simpler"): a ✓ for Plus's 25 target alerts and Premium's
// unlimited ones said the same thing about two different plans. DECISIONS.md,
// "/premium shows each plan's real limits".
//
// EVERY CELL IS READ, NEVER TYPED. Each row names the TIER_COMPARISON row it
// stands for (`from`, the list the Premium explainer's table is rendered from),
// and a cell is that row's value: `true` a ✓, `false` an em dash, a string the
// limit itself ("10 cards", "Top 3", "3 plans a month"). A limit changed in
// lib/free-limits.ts or lib/alert-limits.ts moves here and in the article at
// once. tests/premium-ticks.test.ts holds every row to its source.
//
// A server-safe component (no hooks): PremiumPricingCards renders it under the
// plan cards with the selected plan's column lit, /premium renders it alone for a
// Plus member (column "You"), and the slide-in shows five rows, dense.

export type TickTier = "free" | "plus" | "premium";

// `short` is the dense (slider) label, for the rows the slider shows.
export const TICK_ROWS: { name: string; from: string | null; short?: string }[] = [
  { name: "Compare prices across every store", from: null },
  // Best Basket and bulk pricing lead (2026-10-25, owner: "a lot of people use
  // premium because they want to use the best basket feature").
  { name: "Best Basket & Buy this list plans", from: "Best Basket — store-by-store plan", short: "Best Basket plans" },
  { name: "Bulk price a list", from: "Bulk price a list" },
  { name: "No ads", from: "Ad-free experience" },
  { name: "Watchlist", from: "Watchlist & new-low alerts" },
  { name: "Portfolio", from: "Portfolio — value, P&L, CSV & replacement cost" },
  { name: "Deal Finder & Rising Cards", from: "Deal Finder" },
  { name: "Price history", from: "Full price history" },
  { name: "Target-price alerts", from: "Target-price alerts after every price update" },
  { name: "Sealed watches", from: "Sealed watches" },
  { name: "Finish this set plans", from: "Finish this set" },
  { name: "Minimum condition", from: "Minimum condition" },
  { name: "Deck price watch", from: "Deck price watch" },
  { name: "Graded price tracking", from: "Graded price tracking" },
  { name: "eBay auction alerts", from: "Auction alerts" },
  { name: "Demand Finder", from: "Demand Finder" },
  { name: "RiftCompare Coins", from: "RiftCompare Coins" },
];

function sourceRow(from: string): TierRow | undefined {
  return TIER_COMPARISON.find((r) => r.feature === from || r.feature.startsWith(from));
}

/** What a tier's cell holds for a row: TIER_COMPARISON's own value. */
export function cellValue(from: string | null, tier: TickTier): boolean | string {
  if (from === null) return true;
  const r = sourceRow(from);
  if (!r) return false;
  return tier === "free" ? r.account : tier === "plus" ? r.plus : r.premium;
}

function Mark({ v, dense }: { v: boolean | string; dense?: boolean }) {
  const size = dense ? "h-5 w-5 text-[11px]" : "h-6 w-6 text-[13px]";
  if (typeof v === "string")
    return <span className={`inline-block font-semibold leading-tight text-slate-200 ${dense ? "text-[10px]" : "text-[11px] sm:text-xs"}`}>{v}</span>;
  return v ? (
    <span aria-label="Included" className={`inline-grid ${size} place-items-center rounded-full bg-buy/15 font-black text-up`}>
      ✓
    </span>
  ) : (
    <span aria-label="Not included" className={`inline-grid ${size} place-items-center font-bold text-slate-600`}>
      —
    </span>
  );
}

export function PremiumTicks({
  showPlus,
  prices,
  selected,
  you,
  onSelect,
  only,
  dense = false,
}: {
  showPlus: boolean;
  /** The column header's price line, e.g. { plus: "$2.99/mo", premium: "$4.99/mo" }. */
  prices: { plus: string; premium: string };
  /** The lit column (the plan card the visitor has picked). */
  selected?: TickTier;
  /** The viewer's own tier, captioned "You". */
  you?: TickTier;
  onSelect?: (tier: TickTier) => void;
  /** A subset of TICK_ROWS by name, in TICK_ROWS order (the Premium slider shows five). */
  only?: string[];
  /** Tighter rows and no price line, for the slider. */
  dense?: boolean;
}) {
  const rows = only ? TICK_ROWS.filter((r) => only.includes(r.name)) : TICK_ROWS;
  const cellY = dense ? "py-1" : "py-2";
  const cols: { key: TickTier; name: string; price: string }[] = [
    { key: "free", name: "Free", price: "No card" },
    ...(showPlus ? [{ key: "plus" as const, name: "Plus", price: prices.plus }] : []),
    { key: "premium", name: "Premium", price: prices.premium },
  ];
  const lit = (k: TickTier) =>
    k === selected ? (k === "premium" ? "bg-gold/[0.09]" : "bg-brand-500/[0.07]") : "";
  return (
    <div className={dense ? "overflow-hidden rounded-lg border border-ink-800" : "card-surface overflow-hidden rounded-2xl border border-ink-700"}>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">What each plan includes</caption>
        <colgroup>
          <col />
          {cols.map((c) => (
            <col key={c.key} className={dense ? (c.key === "premium" ? "w-[72px]" : "w-[56px]") : "w-[72px] sm:w-[120px]"} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-ink-700">
            <th scope="col" className={`px-3 ${dense ? "py-1.5" : "py-3"} text-left align-bottom text-[11px] font-bold uppercase tracking-wider text-slate-500`}>
              {dense ? "" : "Compare plans"}
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`px-1 ${dense ? "py-1.5" : "py-3"} text-center align-bottom transition-colors ${lit(c.key)}`}>
                {onSelect && c.key !== "free" ? (
                  <button type="button" onClick={() => onSelect(c.key)} aria-pressed={c.key === selected} className="w-full">
                    <ColHead name={c.name} price={dense ? null : c.price} tier={c.key} you={you === c.key} />
                  </button>
                ) : (
                  <ColHead name={c.name} price={dense ? null : c.price} tier={c.key} you={you === c.key} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-ink-800 last:border-0">
              <th scope="row" className={`${dense ? "px-2.5 py-1 text-[12px]" : "px-3 py-2.5 text-[13px] sm:text-sm"} text-left font-semibold leading-snug text-slate-200`}>
                {dense ? (r.short ?? r.name) : r.name}
              </th>
              {cols.map((c) => (
                <td key={c.key} className={`px-1 ${cellY} text-center transition-colors ${lit(c.key)}`}>
                  <Mark v={cellValue(r.from, c.key)} dense={dense} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColHead({ name, price, tier, you }: { name: string; price: string | null; tier: TickTier; you: boolean }) {
  return (
    <>
      {you && (
        <span className="mb-1 inline-block rounded-full bg-ink-700 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-slate-200">
          You
        </span>
      )}
      <span className={`block text-[13px] font-extrabold sm:text-sm ${tier === "premium" ? "text-gold" : tier === "plus" ? "text-white" : "text-slate-300"}`}>
        {name}
      </span>
      {price && <span className="num block text-[10px] font-semibold text-slate-500 sm:text-xs">{price}</span>}
    </>
  );
}
