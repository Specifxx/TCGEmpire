import { formatMoney } from "@/lib/format";
import type { Deal } from "@/lib/top-deals";

// A sample price-alert email (2026-10-23, DECISIONS.md "/premium, rebuilt to
// convert, honestly"), built from ONE real deal on today's board and labelled
// "Example alert" — no alert was sent, and the wording says a real alert fires
// on the member's own target price. The card, price, store and market price
// are today's live figures; nothing else is invented. Renders nothing without
// a deal.
export function PremiumAlertPreview({ deal, currency }: { deal: Deal | null; currency: string }) {
  if (!deal || deal.refCents == null) return null;
  const fmt = (c: number) => formatMoney(c, currency);
  return (
    <section aria-labelledby="premium-alert-preview" className="mx-auto mt-10 max-w-xl" data-premium-alert-preview>
      <h2 id="premium-alert-preview" className="text-center font-display text-xl font-extrabold text-white sm:text-2xl">
        What an alert looks like
      </h2>
      <p className="mt-1 text-center text-sm text-slate-400">
        Set the price you&apos;d pay on a card, a sealed box or a whole deck. When it gets there, this lands in your inbox.
      </p>
      <figure className="card-surface relative mt-4 overflow-hidden rounded-2xl border border-ink-700">
        <span className="absolute right-2 top-2 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-gold">
          Example alert
        </span>
        <div className="border-b border-ink-700 px-4 py-3 text-xs text-slate-400">
          <div>
            <span className="font-semibold text-slate-300">From:</span> RiftCompare alerts
          </div>
          <div className="mt-0.5 truncate pr-24">
            <span className="font-semibold text-slate-300">Subject:</span> {deal.title} hit your price: {fmt(deal.priceCents)}
          </div>
        </div>
        <div className="px-4 py-4 text-sm leading-relaxed text-slate-300">
          <p>
            <strong className="text-white">{deal.title}</strong> is now <strong className="text-white">{fmt(deal.priceCents)}</strong>
            {deal.storeName ? <> at {deal.storeName}</> : null}
            {deal.postageIncluded ? " including postage" : " plus postage"}
            {deal.pctLabel != null ? <>, {deal.pctLabel}% below its market price of {fmt(deal.refCents)}</> : null}.
          </p>
          <p className="mt-3">
            <span className="inline-block rounded-lg bg-buy px-3 py-1.5 text-xs font-bold text-white [[data-theme=light]_&]:text-ink-950">View the deal</span>
          </p>
        </div>
        <figcaption className="border-t border-ink-700 px-4 py-2 text-[11px] text-slate-400">
          Example built from a real deal on today&apos;s board. Your alerts use your own target price.
        </figcaption>
      </figure>
    </section>
  );
}
