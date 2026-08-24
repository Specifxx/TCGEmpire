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
  { feature: "RiftCompare Index, movers & daily wrap", anon: true, account: true, premium: true },
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

export function TierCell({ v }: { v: boolean | string }) {
  if (v === true) return <span className="font-bold text-brand-400" aria-label="Included">✓</span>;
  if (v === false) return <span className="text-slate-600" aria-label="Not included">—</span>;
  return <span className="text-xs font-semibold text-slate-300">{v}</span>;
}

/**
 * `compact` trims the padding and type scale for the dialog, where the table sits
 * inside a modal rather than a full page. The COLUMNS and ROWS are identical in
 * both — a modal that quietly dropped rows would be the same drift in a new form.
 */
export function TierComparisonTable({ compact = false }: { compact?: boolean }) {
  const cell = compact ? "px-2 py-1.5" : "px-3 py-2.5";
  return (
    // min-w forces the three tier columns to stay readable; the wrapper scrolls
    // horizontally rather than letting them crush together on a phone.
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${compact ? "min-w-[460px] text-xs" : "min-w-[560px] text-sm"}`}>
        <thead>
          <tr className="border-b border-ink-700 text-left">
            <th scope="col" className={`${cell} font-semibold text-slate-400`}>Feature</th>
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} text-center font-semibold text-slate-400`}>
              No account
            </th>
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} text-center font-bold text-brand-300`}>
              Free account
            </th>
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} text-center font-bold text-gold`}>
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {TIER_COMPARISON.map((r) => (
            <tr key={r.feature} className="border-b border-ink-800 last:border-0">
              <th scope="row" className={`${cell} text-left font-normal text-slate-200`}>{r.feature}</th>
              <td className={`${cell} text-center`}><TierCell v={r.anon} /></td>
              <td className={`${cell} text-center`}><TierCell v={r.account} /></td>
              <td className={`${cell} text-center`}><TierCell v={r.premium} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
