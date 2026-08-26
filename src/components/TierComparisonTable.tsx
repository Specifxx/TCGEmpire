// THE TIER COMPARISON — ONE TABLE, ONE LIST OF ROWS, TWO PLACES THAT SHOW IT.
//
// This lived inside app/premium/page.tsx as a local `COMPARE` array. The Premium
// upsell DIALOG could not reach it (a page module, and the dialog is a client
// component), so the dialog showed its own hand-written six-item list of
// Premium-only perks instead — a second, shorter, differently-worded answer to
// "what do I get?".
//
// That is the drift this repo keeps paying for: the same product claim written
// twice, updated once. The Best Basket tier change had to be chased through six
// files for exactly this reason. So the rows and the renderer live here, and both
// surfaces import them.
//
// NOT a client component on purpose — it is pure presentation with no state or
// handlers, so it renders inside the server-rendered /premium page AND inside the
// client-side dialog without forcing either into the other's model.
//
// EVERY ROW IS A REAL ENTITLEMENT, checkable against the code:
//   anon/account gates  lib/premium.ts — hasAccount() / isPremium()
//   Best Basket         api/basket 401 + tools/best-basket hasAccount()
//   Deal Finder etc.    the "Top pick vs Full list" split is the free teaser
//
// `false` renders an em dash, `true` a tick, a string renders as-is — the rows
// that are neither a flat yes nor a flat no are the honest part of the table and
// must stay strings rather than being rounded to a tick.

export type TierRow = {
  feature: string;
  anon: boolean | string;
  account: boolean | string;
  premium: boolean | string;
};

export const TIER_COMPARISON: TierRow[] = [
  { feature: "Compare prices across every store + eBay", anon: true, account: true, premium: true },
  { feature: "Full card database, search & browse", anon: true, account: true, premium: true },
  { feature: "Deck builder, trade calculator & box EV", anon: true, account: true, premium: true },
  { feature: "Daily price movers — biggest risers & fallers", anon: true, account: true, premium: true },
  { feature: "Price alerts", anon: false, account: true, premium: true },
  { feature: "Portfolio tracker — history, P&L, CSV export", anon: false, account: true, premium: true },
  { feature: "Best Basket — cheapest store split, postage included", anon: false, account: true, premium: true },
  { feature: "Deal Finder", anon: "Top pick", account: "Top pick", premium: "Full list" },
  { feature: "Rising Cards", anon: "Top pick", account: "Top pick", premium: "Full list" },
  { feature: "Value Finder screener", anon: false, account: false, premium: true },
  { feature: "Bulk Pricer — price a whole list at once", anon: false, account: false, premium: true },
  { feature: "Condition Impact Calculator", anon: false, account: false, premium: true },
  { feature: "Ad-free experience", anon: false, account: false, premium: true },
];

export function TierCell({ v, dialog = false }: { v: boolean | string; dialog?: boolean }) {
  if (v === true) return <span className="font-bold text-brand-400" aria-label="Included">✓</span>;
  if (v === false)
    return dialog ? (
      <span className="font-bold text-red-500" aria-label="Not included">✗</span>
    ) : (
      <span className="text-slate-600" aria-label="Not included">—</span>
    );
  return <span className="text-xs font-semibold text-slate-300">{v}</span>;
}

// The compact dialog is a fast glance, not the full accounting — /premium (the
// link right below the table) is where the complete, unabridged list lives.
//
// Two reasons a row is omitted here, and both are about the popup's job rather
// than the row being unimportant:
//   • length — the popup caps its own height and scrolls, so every row costs
//     something (Ad-free experience, Condition Impact Calculator);
//   • no signal — with the "No account" column dropped below, a row that is a
//     tick for BOTH remaining columns tells a reader deciding whether to pay
//     nothing at all. The four here are exactly that shape.
// The rows that survive are the ones that differentiate, plus the handful of
// flat-tick rows that establish what the free tier already covers.
// Exported for tests/access-tiers.test.ts only: a typo in either of these sets
// is a SILENT no-op — the row just keeps rendering — so the only thing that can
// catch it is an assertion that every entry matches a real TIER_COMPARISON row.
export const DIALOG_OMIT_FEATURES = new Set([
  "Ad-free experience",
  "Condition Impact Calculator",
  "Deck builder, trade calculator & box EV",
  "Daily price movers — biggest risers & fallers",
  "Price alerts",
  "Portfolio tracker — history, P&L, CSV export",
]);

// TIER_COMPARISON keeps "Top pick" as the honest answer for these two rows (a
// free account isn't shut out, just capped) — that string stays intact above
// for /premium. The dialog is a conversion surface rather than a spec sheet, so
// there it collapses to the same tick/✗ vocabulary as every other row.
export const DIALOG_BINARY_FEATURES = new Set(["Deal Finder", "Rising Cards"]);

/**
 * `compact` is also "is this the dialog?" — it trims padding/type scale AND
 * switches the popup-specific presentation above (fewer rows, no anon column,
 * red ✗ instead of an em dash). The underlying TIER_COMPARISON rows — and what
 * /premium renders from them — are untouched either way.
 */
export function TierComparisonTable({ compact = false }: { compact?: boolean }) {
  const cell = compact ? "px-2 py-1.5" : "px-3 py-2.5";
  const rows = compact
    ? TIER_COMPARISON.filter((r) => !DIALOG_OMIT_FEATURES.has(r.feature)).map((r) =>
        DIALOG_BINARY_FEATURES.has(r.feature) ? { ...r, account: false, premium: true } : r
      )
    : TIER_COMPARISON;
  return (
    // min-w forces the tier columns to stay readable; the wrapper scrolls
    // horizontally rather than letting them crush together on a phone.
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${compact ? "min-w-[380px] text-xs" : "min-w-[560px] text-sm"}`}>
        <thead>
          <tr className="border-b border-ink-700 text-left">
            <th scope="col" className={`${cell} font-semibold text-slate-400`}>Feature</th>
            {!compact && (
              <th scope="col" className={`w-24 ${cell} text-center font-semibold text-slate-400`}>
                No account
              </th>
            )}
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} text-center font-bold text-brand-300`}>
              Free account
            </th>
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} text-center font-bold text-gold`}>
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} className="border-b border-ink-800 last:border-0">
              <th scope="row" className={`${cell} text-left font-normal text-slate-200`}>{r.feature}</th>
              {!compact && <td className={`${cell} text-center`}><TierCell v={r.anon} /></td>}
              <td className={`${cell} text-center`}><TierCell v={r.account} dialog={compact} /></td>
              <td className={`${cell} text-center`}><TierCell v={r.premium} dialog={compact} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
