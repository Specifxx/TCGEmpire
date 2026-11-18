import { BEST_TAG_CLASS, bestPriceHint } from "@/lib/best-price";

/** The small, neutral "Best price" tag of a non-affiliate cheapest row (owner, 2026-11-18; lib/best-price.ts). */
export function BestPriceTag({ className = "" }: { className?: string }) {
  return (
    <span data-best-tag="plain" className={`${BEST_TAG_CLASS.plain} ${className}`}>
      Best price
    </span>
  );
}

/** The one-line muted note under the tag (an "i" mark, visible on a phone too); only when an eBay and/or TCGplayer row is on the list. */
export function BestPriceNote({ has, className = "" }: { has: { ebay: boolean; tcgplayer: boolean }; className?: string }) {
  const hint = bestPriceHint(has);
  if (!hint) return null;
  return (
    <p data-best-note="" className={`text-[11px] text-slate-500 ${className}`}>
      <span aria-hidden="true" className="mr-1">ⓘ</span>
      {hint}
    </p>
  );
}
