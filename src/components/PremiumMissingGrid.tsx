import Link from "next/link";
import { TIER_COMPARISON, DIALOG_OMIT_FEATURES, type TierRow } from "./TierComparisonTable";

// WHAT YOU'RE MISSING — the top of /premium (2026-10-15, owner: "the ticks on what
// plus and premium does are not enough -> we need to show what users are missing
// out on at the very top so like the ticks and crosses must be visible as well as
// formatted nicely on a phone screen"). DECISIONS.md, "/premium opens with what
// you're missing".
//
// The rows are TIER_COMPARISON's, never retyped: this is a different PRESENTATION
// of the same entitlements (tests/premium-tiers.test.ts checks them against the
// code). What changes is the shape, built for a 390px screen:
//   - every feature everyone gets folds into ONE "free for everyone" row, so the
//     grid is the list of things a payment changes;
//   - each feature has a short name (and, from sm up, a one-line description);
//   - a cell is an icon first — a tick, a cross, or a half mark for "limited" —
//     with a two-word caption under it ("10 cards", "Full list"), so three 64px
//     columns hold every value without a sideways scroll;
//   - the visitor's own column carries a "You" chip, so the crosses read as what
//     THEY are missing.
// A server component: pure presentation, no state.

/** Short name and one-line description for each row that differs by tier. */
export const GRID_LABELS: Record<string, { name: string; detail: string }> = {
  "Watchlist & new-low alerts": { name: "Watchlist & new-low alerts", detail: "Email when a card you watch hits a new low" },
  "Portfolio — value, P&L, CSV & replacement cost": { name: "Portfolio tracker", detail: "Value, profit and loss, CSV and replacement cost" },
  "Set tracker — what your binder is missing and the cheapest listing to finish": { name: "Set tracker", detail: "What your binder is missing, and the cheapest way to finish" },
  "Deal Finder": { name: "Deal Finder", detail: "Cards selling under their market price right now" },
  "Rising Cards": { name: "Rising Cards", detail: "The cards gaining the most, every day" },
  "Target-price alerts after every price update": { name: "Target-price alerts", detail: "Email the moment a card hits the price you set" },
  "Best Basket — cheapest delivered order for a list": { name: "Best Basket", detail: "Which stores to buy a list from, postage included" },
  "Buy this list — deck or watchlist, skipping cards you own": { name: "Buy this list", detail: "Your deck or watchlist, skipping cards you own" },
  "Finish this set — store-by-store plan for what's missing, postage included": { name: "Finish this set", detail: "A store-by-store plan for the cards you're missing" },
  "Minimum condition — NM only or LP or better, in the plan and the deck watch": { name: "Minimum condition", detail: "NM only, or LP or better, in every plan" },
  "Demand Finder — most searched & viewed cards": { name: "Demand Finder", detail: "The most searched and viewed cards" },
  "Deck price watch — email when a deck's delivered total drops": { name: "Deck price watch", detail: "Email when a saved deck gets cheaper to buy" },
  "Full price history — every day since tracking began, with CSV download": { name: "Full price history", detail: "Every day since tracking began, with CSV download" },
  "Graded price tracking — history and new-low alerts for each grade (PSA 10, BGS 9.5…)": { name: "Graded price tracking", detail: "History and alerts for PSA 10, BGS 9.5 and more" },
  "Auction alerts — email when a card you watch has an eBay auction ending within 24 hours": { name: "Auction alerts", detail: "eBay auctions on your cards, ending in 24 hours" },
  "RiftCompare Coins — earn free pulls and collect twelve champion coins": { name: "RiftCompare Coins", detail: "Earn free pulls and collect twelve champion coins" },
  "Ad-free experience": { name: "No ads", detail: "The whole site, ad-free" },
};

/** Sealed watches' feature text carries its markets and cadence, so it is matched by prefix. */
function labelFor(row: TierRow): { name: string; detail: string } {
  if (row.feature.startsWith("Sealed watches")) return { name: "Sealed watches", detail: "Restock, at-RRP and price alerts for boxes and packs" };
  return GRID_LABELS[row.feature] ?? { name: row.feature, detail: "" };
}

export const MISSING_ROWS = TIER_COMPARISON.filter((r) => !DIALOG_OMIT_FEATURES.has(r.feature));

/** Two words for a phone column: "Full list + only my cards" → "Full list". */
export function shortCaption(v: string): string {
  const s = v.trim();
  const upTo = s.match(/^Up to (\d+)(?: cards)?$/i);
  if (upTo) return s.toLowerCase().includes("cards") ? `${upTo[1]} cards` : `Up to ${upTo[1]}`;
  if (/^Store-by-store plan/i.test(s)) return "Store plan";
  if (/^Full list/i.test(s)) return "Full list";
  if (/^Whole sets/i.test(s)) return "No limit";
  if (/total/i.test(s)) return "Total only";
  if (/^Top 10/i.test(s)) return "Top 10";
  if (/^Last (\d+) days$/i.test(s)) return s.replace(/^Last /i, "");
  return s;
}

type Mark = "yes" | "no" | "part";
/** A string in the free column is a limit; in a paid column it is the full thing unless it equals the free one. */
function markOf(v: boolean | string, freeValue: boolean | string, isFree: boolean): Mark {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (isFree) return "part";
  return v === freeValue ? "part" : "yes";
}

function Cell({ v, mark }: { v: boolean | string; mark: Mark }) {
  const caption = typeof v === "string" ? shortCaption(v) : null;
  return (
    <span className="flex flex-col items-center gap-0.5">
      {mark === "yes" ? (
        <span aria-label="Included" className="grid h-5 w-5 place-items-center rounded-full bg-brand-500/15 text-[12px] font-black text-brand-400">✓</span>
      ) : mark === "no" ? (
        <span aria-label="Not included" className="grid h-5 w-5 place-items-center rounded-full bg-red-500/10 text-[12px] font-black text-red-400 [[data-theme=light]_&]:text-red-600">✕</span>
      ) : (
        <span aria-label="Limited" className="grid h-5 w-5 place-items-center rounded-full bg-amber-500/15 text-[11px] font-black text-amber-400 [[data-theme=light]_&]:text-amber-700">◐</span>
      )}
      {caption && <span className="text-center text-[10px] font-semibold leading-tight text-slate-400 sm:text-[11px]">{caption}</span>}
    </span>
  );
}

export type GridTier = "free" | "plus" | "premium";

export function PremiumMissingGrid({
  you,
  showPlus,
  plusPrice,
  premiumPrice,
}: {
  /** The visitor's own column: signed out and free accounts are "free". */
  you: GridTier;
  showPlus: boolean;
  plusPrice: string;
  premiumPrice: string;
}) {
  const cols: { key: GridTier; name: string; price: string | null }[] = [
    { key: "free", name: "Free", price: null },
    ...(showPlus ? [{ key: "plus" as const, name: "Plus", price: `${plusPrice}/mo` }] : []),
    { key: "premium", name: "Premium", price: `${premiumPrice}/mo` },
  ];
  const valueOf = (r: TierRow, k: GridTier) => (k === "free" ? r.account : k === "plus" ? r.plus : r.premium);
  const wash = (k: GridTier) => (k === "premium" ? "bg-gold/[0.07]" : k === "plus" ? "bg-slate-500/[0.05]" : "");
  return (
    <div className="card-surface overflow-hidden rounded-2xl border border-ink-700">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col />
          {cols.map((c) => (
            <col key={c.key} className="w-[64px] sm:w-[120px]" />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-ink-700">
            <th scope="col" className="px-3 py-3 text-left align-bottom text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Feature
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`px-1 py-3 text-center align-bottom ${wash(c.key)}`}>
                {c.key === you && (
                  <span className="mb-1 inline-block rounded-full bg-ink-700 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-slate-200 sm:text-[10px]">
                    You
                  </span>
                )}
                <span className={`block text-[13px] font-extrabold sm:text-sm ${c.key === "premium" ? "text-gold" : c.key === "plus" ? "text-slate-100" : "text-slate-300"}`}>
                  {c.name}
                </span>
                <span className="block text-[10px] font-semibold text-slate-500 sm:text-xs">{c.price ?? "No card"}</span>
                {c.key !== "free" && c.key !== you && (
                  <a
                    href="#top-pricing"
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold sm:text-xs ${
                      c.key === "premium" ? "bg-gold/20 text-gold hover:bg-gold/30" : "bg-ink-700 text-slate-100 hover:bg-ink-600"
                    }`}
                  >
                    Get ↓
                  </a>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-ink-800">
            <th scope="row" className="px-3 py-2.5 text-left align-middle font-normal">
              <span className="block text-[13px] font-semibold leading-snug text-white sm:text-sm">Compare prices, search & every free tool</span>
              <span className="hidden text-xs text-slate-500 sm:block">Every store and eBay, the card database, charts, deck pricer, index and movers</span>
            </th>
            {cols.map((c) => (
              <td key={c.key} className={`px-1 py-2.5 text-center align-middle ${wash(c.key)}`}>
                <Cell v={true} mark="yes" />
              </td>
            ))}
          </tr>
          {MISSING_ROWS.map((r) => {
            const label = labelFor(r);
            return (
              <tr key={r.feature} className="border-b border-ink-800 last:border-0">
                <th scope="row" className="px-3 py-2.5 text-left align-middle font-normal">
                  <span className="block text-[13px] font-semibold leading-snug text-white sm:text-sm">{label.name}</span>
                  {label.detail && <span className="hidden text-xs text-slate-500 sm:block">{label.detail}</span>}
                </th>
                {cols.map((c) => {
                  const v = valueOf(r, c.key);
                  return (
                    <td key={c.key} className={`px-1 py-2.5 text-center align-middle ${wash(c.key)}`}>
                      <Cell v={v} mark={markOf(v, r.account, c.key === "free")} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-ink-700 px-3 py-2.5 text-center text-[11px] text-slate-500">
        <span className="text-brand-400">✓</span> included · <span className="text-amber-400 [[data-theme=light]_&]:text-amber-700">◐</span> limited ·{" "}
        <span className="text-red-400 [[data-theme=light]_&]:text-red-600">✕</span> not included ·{" "}
        <Link href="#premium-faq" className="hover:underline">questions</Link>
      </p>
    </div>
  );
}
