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
//   account gates       lib/premium.ts — hasAccount() / isPremium()
//   Best Basket         api/basket 403 + tools/best-basket isPremium()
//   Deal Finder etc.    tools/deal-finder + tools/rising, which run no query
//                       at all below a paid tier (2026-09-22)
//
// NO "NO ACCOUNT" COLUMN (2026-09-22, owner's call). It had four columns doing
// the work of three: signed-out and free-account differ on exactly two rows
// (price alerts, portfolio), and a reader deciding whether to PAY does not need
// that distinction spelled out on the pricing page. The signed-out pitch is its
// own surface — FreeAccountCompare, in the signup popup — and that is where
// "what does an account add" belongs. The dialog had already dropped the column
// for space; this makes both surfaces agree.
//
// `false` renders an em dash, `true` a tick, a string renders as-is — the rows
// that are neither a flat yes nor a flat no are the honest part of the table and
// must stay strings rather than being rounded to a tick.

export type TierRow = {
  feature: string;
  account: boolean | string;
  // Plus (2026-09-11): the cheaper tier. "See everything vs do everything" —
  // Plus matches Premium on ad-free + the full lists (Deal Finder, Rising
  // Cards); the four pro tools stay Premium-only. Every row where plus !==
  // premium is exactly the pitch for upgrading from Plus to Premium.
  plus: boolean | string;
  premium: boolean | string;
};

export const TIER_COMPARISON: TierRow[] = [
  { feature: "Compare prices across every store + eBay", account: true, plus: true, premium: true },
  { feature: "Full card database, search & browse", account: true, plus: true, premium: true },
  { feature: "Deck builder, trade calculator & box EV", account: true, plus: true, premium: true },
  { feature: "RiftCompare Index & daily price movers", account: true, plus: true, premium: true },
  { feature: "Condition Impact Calculator", account: true, plus: true, premium: true },
  { feature: "Price alerts", account: true, plus: true, premium: true },
  { feature: "Portfolio tracker — history, P&L, CSV export", account: true, plus: true, premium: true },
  // account: false since 2026-09-22 — these two stopped giving a free teaser
  // away entirely (both pages run no query below a paid tier), so "Top pick"
  // here was advertising something the site no longer does. Rising Sealed is
  // NOT in this pair: it still shows its top pick, and its copy still says so.
  { feature: "Deal Finder", account: false, plus: "Full list", premium: "Full list" },
  { feature: "Rising Cards", account: false, plus: "Full list", premium: "Full list" },
  { feature: "Value Finder screener", account: false, plus: false, premium: true },
  { feature: "Bulk Pricer — price a whole list at once", account: false, plus: false, premium: true },
  { feature: "Best Basket — cheapest store split, postage included", account: false, plus: false, premium: true },
  { feature: "Demand Finder — most searched & viewed cards", account: false, plus: false, premium: true },
  // Ad-free moved Plus → Premium on 2026-09-14. Plus kept the two things it
  // shares with Premium (the full Deal Finder and Rising Cards lists) AND
  // ad-free, which left Premium differentiated only by four bulk/screener
  // tools most visitors have no use for — a $4.99 card that ticked every
  // broadly-appealing box sitting immediately left of a $9.99 one. Existing
  // Plus subscribers keep ad-free via premiumTierFloor (see DECISIONS.md).
  { feature: "Ad-free experience", account: false, plus: false, premium: true },
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
//     something (Ad-free experience);
//   • no signal — a row that is a tick for every column tells a reader deciding
//     whether to pay nothing at all. The five here (the Condition Impact
//     Calculator among them, now free for everyone) are exactly that shape.
// The rows that survive are the ones that differentiate, plus the handful of
// flat-tick rows that establish what the free tier already covers.
// Exported for tests/access-tiers.test.ts only: a typo in either of these sets
// is a SILENT no-op — the row just keeps rendering — so the only thing that can
// catch it is an assertion that every entry matches a real TIER_COMPARISON row.
export const DIALOG_OMIT_FEATURES = new Set([
  "Ad-free experience",
  "Condition Impact Calculator",
  "Deck builder, trade calculator & box EV",
  "RiftCompare Index & daily price movers",
  "Price alerts",
  "Portfolio tracker — history, P&L, CSV export",
]);

// /premium spells these out as "Full list" for the paid columns, which is the
// spec-sheet answer. The dialog is a conversion surface rather than a spec
// sheet, so there they collapse to the same tick/✗ vocabulary as every other
// row. The free column is a plain ✗ on both since 2026-09-22.
export const DIALOG_BINARY_FEATURES = new Set(["Deal Finder", "Rising Cards"]);

/**
 * `compact` is also "is this the dialog?" — it trims padding/type scale AND
 * switches the popup-specific presentation above (fewer rows, red ✗ instead of
 * an em dash). Both surfaces now show the same COLUMNS. The underlying
 * TIER_COMPARISON rows — and what /premium renders from them — are untouched
 * either way.
 *
 * `showPlus` renders the Plus column between Free account and Premium — pass
 * it only once Plus is actually configured (premiumPlusEnabled()) so a dark
 * Plus tier never appears as a real, choosable column.
 *
 * `tinted` gives each paid column a faint background wash (Plus: slate,
 * Premium: gold) instead of a flat table — the comp-page pattern the pricing
 * cards above this table borrow their whole layout from. Cosmetic only, no
 * new data; off by default so the dialog's compact table is unaffected.
 */
export function TierComparisonTable({
  compact = false,
  showPlus = false,
  tinted = false,
}: {
  compact?: boolean;
  showPlus?: boolean;
  tinted?: boolean;
}) {
  const cell = compact ? "px-2 py-1.5" : "px-3 py-2.5";
  const rows = compact
    ? TIER_COMPARISON.filter((r) => !DIALOG_OMIT_FEATURES.has(r.feature)).map((r) =>
        DIALOG_BINARY_FEATURES.has(r.feature) ? { ...r, plus: true, premium: true } : r
      )
    : TIER_COMPARISON;
  const plusWash = tinted ? "bg-slate-500/[0.06]" : "";
  const premiumWash = tinted ? "bg-gold/[0.07]" : "";
  return (
    // min-w forces the tier columns to stay readable; the wrapper scrolls
    // horizontally rather than letting them crush together on a phone.
    <div className="overflow-x-auto">
      <table
        className={`w-full border-collapse ${
          compact ? (showPlus ? "min-w-[440px]" : "min-w-[380px]") + " text-xs" : (showPlus ? "min-w-[560px]" : "min-w-[440px]") + " text-sm"
        }`}
      >
        <thead>
          <tr className="border-b border-ink-700 text-left">
            <th scope="col" className={`${cell} font-semibold text-slate-400`}>Feature</th>
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} text-center font-bold text-brand-400`}>
              Free account
            </th>
            {showPlus && (
              <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} ${plusWash} text-center font-bold text-slate-200`}>
                Plus
              </th>
            )}
            <th scope="col" className={`${compact ? "w-16" : "w-24"} ${cell} ${premiumWash} text-center font-bold text-gold`}>
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} className="border-b border-ink-800 last:border-0">
              <th scope="row" className={`${cell} text-left font-normal text-slate-200`}>{r.feature}</th>
              <td className={`${cell} text-center`}><TierCell v={r.account} dialog={compact} /></td>
              {showPlus && <td className={`${cell} ${plusWash} text-center`}><TierCell v={r.plus} dialog={compact} /></td>}
              <td className={`${cell} ${premiumWash} text-center`}><TierCell v={r.premium} dialog={compact} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
