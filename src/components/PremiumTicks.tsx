import { TIER_COMPARISON, type TierRow } from "./TierComparisonTable";

// THE /premium COMPARISON — TICKS AND CROSSES, NOTHING ELSE (2026-10-17, owner:
// "that comparison it should only be ticks and crosses there shouldn't be
// anything else in there like it just confuses the buyer and also like it
// should be cut down a lot"). DECISIONS.md, "/premium, 70% simpler".
//
// Twelve rows, each a short name a buyer reads at a glance. No captions ("Top
// 3", "Up to 50"), no half marks, no descriptions: a cell is ✓ or ✕.
//
// THE MARKS ARE COMPUTED, NEVER TYPED. Each row names the TIER_COMPARISON row it
// stands for (`from`), and a tier gets a tick only when it has the WHOLE thing
// the row's name says:
//   - Free: only a flat `true` (a limit such as "25 cards" or "Top 3" is a
//     cross, which is why those rows are named "Unlimited…" and "Full…");
//   - a paid tier: anything but `false`, unless it is the same limited value
//     Free has (Plus's "Top 10 searched" Demand Finder is Free's, so ✕).
// tests/premium-ticks.test.ts holds every name to that rule, so a tier change
// in TIER_COMPARISON moves the tick here without anyone retyping it.
//
// A server-safe component (no hooks): PremiumPricingCards renders it under the
// plan cards with the selected plan's column lit, and /premium renders it alone
// for a Plus member, whose column says "You".

export type TickTier = "free" | "plus" | "premium";

export const TICK_ROWS: { name: string; from: string | null }[] = [
  { name: "Compare prices across every store", from: null },
  { name: "No ads", from: "Ad-free experience" },
  { name: "Unlimited watchlist & portfolio", from: "Watchlist & new-low alerts" },
  { name: "Target-price alerts", from: "Target-price alerts after every price update" },
  { name: "Full Deal Finder & Rising Cards", from: "Deal Finder" },
  { name: "Full price history + CSV", from: "Full price history — every day since tracking began, with CSV download" },
  { name: "Graded price tracking", from: "Graded price tracking — history and new-low alerts for each grade (PSA 10, BGS 9.5…)" },
  { name: "Sealed restock & price alerts", from: "Sealed watches" },
  { name: "Store-by-store buying plan", from: "Best Basket — cheapest delivered order for a list" },
  { name: "Deck price watch", from: "Deck price watch — email when a deck's delivered total drops" },
  { name: "eBay auction alerts", from: "Auction alerts — email when a card you watch has an eBay auction ending within 24 hours" },
  { name: "Full Demand Finder", from: "Demand Finder — most searched & viewed cards" },
];

function sourceRow(from: string): TierRow | undefined {
  return TIER_COMPARISON.find((r) => r.feature === from || r.feature.startsWith(from));
}

/** ✓ only when the tier has the whole of what the row's name says. */
export function hasTick(from: string | null, tier: TickTier): boolean {
  if (from === null) return true;
  const r = sourceRow(from);
  if (!r) return false;
  if (tier === "free") return r.account === true;
  const v = tier === "plus" ? r.plus : r.premium;
  if (v === false) return false;
  return v === true || v !== r.account;
}

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <span aria-label="Included" className="inline-grid h-6 w-6 place-items-center rounded-full bg-buy/15 text-[13px] font-black text-up">
      ✓
    </span>
  ) : (
    <span aria-label="Not included" className="inline-grid h-6 w-6 place-items-center text-[13px] font-bold text-slate-600">
      ✕
    </span>
  );
}

export function PremiumTicks({
  showPlus,
  prices,
  selected,
  you,
  onSelect,
}: {
  showPlus: boolean;
  /** The column header's price line, e.g. { plus: "$2.99/mo", premium: "$4.99/mo" }. */
  prices: { plus: string; premium: string };
  /** The lit column (the plan card the visitor has picked). */
  selected?: TickTier;
  /** The viewer's own tier, captioned "You". */
  you?: TickTier;
  onSelect?: (tier: TickTier) => void;
}) {
  const cols: { key: TickTier; name: string; price: string }[] = [
    { key: "free", name: "Free", price: "No card" },
    ...(showPlus ? [{ key: "plus" as const, name: "Plus", price: prices.plus }] : []),
    { key: "premium", name: "Premium", price: prices.premium },
  ];
  const lit = (k: TickTier) =>
    k === selected ? (k === "premium" ? "bg-gold/[0.09]" : "bg-brand-500/[0.07]") : "";
  return (
    <div className="card-surface overflow-hidden rounded-2xl border border-ink-700">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">What each plan includes</caption>
        <colgroup>
          <col />
          {cols.map((c) => (
            <col key={c.key} className="w-[68px] sm:w-[120px]" />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-ink-700">
            <th scope="col" className="px-3 py-3 text-left align-bottom text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Compare plans
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`px-1 py-3 text-center align-bottom transition-colors ${lit(c.key)}`}>
                {onSelect && c.key !== "free" ? (
                  <button type="button" onClick={() => onSelect(c.key)} aria-pressed={c.key === selected} className="w-full">
                    <ColHead name={c.name} price={c.price} tier={c.key} you={you === c.key} />
                  </button>
                ) : (
                  <ColHead name={c.name} price={c.price} tier={c.key} you={you === c.key} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TICK_ROWS.map((r) => (
            <tr key={r.name} className="border-b border-ink-800 last:border-0">
              <th scope="row" className="px-3 py-2.5 text-left text-[13px] font-semibold leading-snug text-slate-200 sm:text-sm">
                {r.name}
              </th>
              {cols.map((c) => (
                <td key={c.key} className={`px-1 py-2 text-center transition-colors ${lit(c.key)}`}>
                  <Mark yes={hasTick(r.from, c.key)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColHead({ name, price, tier, you }: { name: string; price: string; tier: TickTier; you: boolean }) {
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
      <span className="num block text-[10px] font-semibold text-slate-500 sm:text-xs">{price}</span>
    </>
  );
}
