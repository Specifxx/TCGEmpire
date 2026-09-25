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
// EVERY ROW IS A REAL ENTITLEMENT, checkable against the code
// (tests/premium-tiers.test.ts reads the paid rows against their gates):
//   account gates        lib/premium.ts — hasAccount() / isPremium()
//   Deal Finder,         tools/deal-finder + tools/rising: no query signed
//   Rising Cards         out, a three-row query for a free account, the full
//                        list for any paid tier (2026-09-23). Deal Finder's
//                        ?mine=watch|own ("only my cards") is honoured only
//                        for a paid tier.
//   Target-price alerts  lib/alert-limits.ts targetAlertLimit(tier) — the
//                        same constant the route that sets a target enforces
//   Best Basket,         api/basket: a signed-in account gets its own total;
//   Buy this list        the store-by-store plan, and sending a deck /
//                        watchlist / binder in with "skip copies I own", need
//                        isPremium(user, "premium")
//   Ad-free              /api/me adFree = isPremium(user) — any paid tier
//
// THE 2026-09-25 LINEUP (owner: fewer tools, each one worth paying for). Value
// Finder, Demand Finder, Rising Sealed and the Condition Impact Calculator
// left the product, each 301'd to the free page that now carries its useful
// part (next.config.js), and the Bulk Pricer's paste-a-list pricing folded
// into the free /deck — so their rows are gone, not ticked for everyone. Plus
// is "no ads, every deal, and an email naming the store when a card you watch
// hits your price"; Premium is "buy your whole list for less".
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

import { PLUS_TARGET_ALERT_LIMIT } from "../lib/alert-limits";

export type TierRow = {
  feature: string;
  account: boolean | string;
  // Plus (2026-09-11): the cheaper tier. Since 2026-09-25 it is "no ads,
  // every deal, and target alerts"; every row where plus !== premium is
  // exactly the pitch for upgrading from Plus to Premium (the list tools and
  // unlimited targets).
  plus: boolean | string;
  premium: boolean | string;
};

export const TIER_COMPARISON: TierRow[] = [
  { feature: "Compare prices across every store + eBay", account: true, plus: true, premium: true },
  { feature: "Full card database, charts & search", account: true, plus: true, premium: true },
  // The Bulk Pricer's paste-a-list pricing lives in the free /deck now.
  { feature: "Deck & list pricer, trade calculator & box EV", account: true, plus: true, premium: true },
  // Weekly, not daily: /movers compares weekly history points.
  { feature: "RiftCompare Index & weekly price movers", account: true, plus: true, premium: true },
  { feature: "Watchlist & new-low email alerts", account: true, plus: true, premium: true },
  // The delivered replacement-cost TOTAL is free; the store-by-store plan
  // behind it is Premium's (the Best Basket row).
  { feature: "Portfolio — value, P&L, CSV & replacement cost", account: true, plus: true, premium: true },
  // "Top 3" since 2026-09-23: a signed-in free account sees the top three rows
  // of each (queried at that size — see FREE_PREVIEW_ROWS in both pages). They
  // were a flat "no" from 2026-09-22, and "Top pick" before that.
  { feature: "Deal Finder", account: "Top 3", plus: "Full list + only my cards", premium: "Full list + only my cards" },
  { feature: "Rising Cards", account: "Top 3", plus: "Full list", premium: "Full list" },
  // Checked after both daily price imports, with no weekly cap. The number
  // is the enforced one (lib/alert-limits.ts), never typed here.
  { feature: "Target-price alerts after every price update", account: false, plus: `Up to ${PLUS_TARGET_ALERT_LIMIT}`, premium: "Unlimited" },
  // Every signed-in account sees its own delivered total, store count and
  // saving; which store to buy each card from is Premium's, withheld in the
  // API response rather than merely hidden.
  { feature: "Best Basket — cheapest delivered order for a list", account: "Your total", plus: "Your total", premium: "Store-by-store plan" },
  { feature: "Buy this list — deck, watchlist or binder, skipping cards you own", account: false, plus: false, premium: true },
  // Ad-free moved Plus → Premium on 2026-09-14 and back to every paid tier on
  // 2026-09-25 (owner's call — DECISIONS.md, "Plus is ad-free again"): with
  // the half-price intro, $2.49/mo Plus is the entry tier, and "no ads" is
  // the most broadly understood reason to pay anything at all. Kept LAST.
  { feature: "Ad-free experience", account: false, plus: true, premium: true },
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
// A row is omitted here for one reason: NO SIGNAL. A row that is a tick for
// every column tells a reader deciding whether to pay nothing at all, and the
// popup caps its own height, so each such row pushes the rows that DO make the
// case further down. What survives is exactly what a payment changes: the full
// lists, target alerts, Best Basket's plan, Buy this list — and the ad-free
// row. That one used to be omitted "for length" (until 2026-09-25), which hid
// the most broadly understood reason to take Plus on the two surfaces that
// actually convert (this dialog and the slide-in).
//
// DERIVED, not hand-listed: it was a hand-typed Set until 2026-09-25, and a
// typo or a reworded row made an entry silently match nothing. Exported for
// tests/access-tiers.test.ts, which still checks both sets against the rows.
export const DIALOG_OMIT_FEATURES = new Set(
  TIER_COMPARISON.filter((r) => r.account === true && r.plus === true && r.premium === true).map((r) => r.feature)
);

// /premium spells these out as "Full list …" for the paid columns, which is the
// spec-sheet answer. The dialog is a conversion surface rather than a spec
// sheet, so there they collapse to the same tick/✗ vocabulary as every other
// row (a 64px dialog column can't hold "Full list + only my cards" anyway). The
// free column keeps its "Top 3" string on both surfaces (2026-09-23) — it is
// the honest answer, and a reason to create the account. Only rows where BOTH
// paid columns get the full thing belong here: collapsing Best Basket's would
// tick "Store-by-store plan" for Plus, which Plus does not get.
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
  // The compact (dialog) strings are unchanged; only the /premium table
  // narrows its tier columns below sm (see the comment on the wrapper).
  // lnum without tnum (2026-09-23): feature names are prose, and body's default
  // tabular figures gave Inter's hyphen a digit-wide advance ("Ad -free").
  const featureCell = compact ? "px-2 py-1.5 [font-feature-settings:'lnum'_1]" : "px-2.5 py-2.5 text-[13px] sm:px-3 sm:text-sm [font-feature-settings:'lnum'_1]";
  const tierHead = compact ? "w-16 px-2 py-1.5" : "w-14 px-1 py-2.5 text-xs sm:w-24 sm:px-3 sm:text-sm";
  const tierData = compact ? "px-2 py-1.5" : "w-14 px-1 py-2.5 text-xs sm:w-24 sm:px-3 sm:text-sm";
  const rows = compact
    ? TIER_COMPARISON.filter((r) => !DIALOG_OMIT_FEATURES.has(r.feature)).map((r) =>
        DIALOG_BINARY_FEATURES.has(r.feature) ? { ...r, plus: true, premium: true } : r
      )
    : TIER_COMPARISON;
  const plusWash = tinted ? "bg-slate-500/[0.06]" : "";
  const premiumWash = tinted ? "bg-gold/[0.07]" : "";
  return (
    // On phones every column fits: a tier cell holds a tick, a dash or a short
    // string, so 56px columns at 12px text are enough (2026-09-23); the two
    // longer ones ("Full list + only my cards", "Store-by-store plan") wrap
    // inside their cell rather than widening the table.
    // The old 560px floor put the table in a 348px box at 390, with Free
    // account 79% visible and Plus and Premium entirely off-screen behind a
    // sideways scroll (a 22rem floor still clipped Premium at 390 and hid it
    // completely at 320, so it is min-w-0). The cost is taller rows
    // at 320. From sm up the min-width keeps the columns roomy and the wrapper
    // still contains its own scroll; the compact dialog table keeps its floor.
    <div className="overflow-x-auto">
      <table
        className={`w-full border-collapse ${
          compact
            ? (showPlus ? "min-w-[440px]" : "min-w-[380px]") + " text-xs"
            : (showPlus ? "min-w-0 sm:min-w-[560px]" : "min-w-0 sm:min-w-[440px]") + " text-sm"
        }`}
      >
        <thead>
          <tr className="border-b border-ink-700 text-left">
            <th scope="col" className={`${featureCell} font-semibold text-slate-400`}>Feature</th>
            <th scope="col" className={`${tierHead} text-center font-bold text-brand-400`}>
              Free account
            </th>
            {showPlus && (
              <th scope="col" className={`${tierHead} ${plusWash} text-center font-bold text-slate-200`}>
                Plus
              </th>
            )}
            <th scope="col" className={`${tierHead} ${premiumWash} text-center font-bold text-gold`}>
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} className="border-b border-ink-800 last:border-0">
              <th scope="row" className={`${featureCell} text-left font-normal text-slate-200`}>{r.feature}</th>
              <td className={`${tierData} text-center`}><TierCell v={r.account} dialog={compact} /></td>
              {showPlus && <td className={`${tierData} ${plusWash} text-center`}><TierCell v={r.plus} dialog={compact} /></td>}
              <td className={`${tierData} ${premiumWash} text-center`}><TierCell v={r.premium} dialog={compact} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
