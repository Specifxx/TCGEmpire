import { CheckedAgo } from "./CheckedAgo";
import { OutboundLink } from "./OutboundLink";

// The Black Friday strip on a sealed product's page (lib/bf-strip.ts; DECISIONS.md, "Black Friday strip on sealed pages",
// 2026-11-19): one short card of facts the page already holds, in the visitor's market. Never fixed or floating; the quick view
// and the phone strip ad are untouched. Its one link (2026-11-21, partner terms: TCGplayer's rate rises with the month's sales) is
// an "Ad"-labelled, tagged TCGplayer search for the product, on its own line: never a price, never ranked, never the cheapest. Built per market on the server (lib/bf-strip-sealed.ts) and
// picked by SealedProductView, so the one CDN copy serves every market.
export interface BlackFridayStripData {
  /** "Black Friday" or "Cyber Monday" (lib/holiday-strip.ts saleStrip). */
  label: string;
  /** "A$289.95 at Good Games" */
  cheapest: string | null;
  /** "Free shipping" when the store's measured checkout posts this order free, else null (nothing is guessed). */
  shipping: string | null;
  /** ISO time the cheapest price was read. */
  checked: string | null;
  /** "Pre-order · out 29 Jan 2027", or null. */
  preorder: string | null;
  /** The history cue (lowCueText), or null. */
  cue: { text: string; lowest: boolean } | null;
  /** The tagged TCGplayer search for this product (affiliateUrl), or null. */
  tcgplayerHref?: string | null;
  /** The visitor's market and the product's name, for the click event. */
  country?: string;
  name?: string;
}

export function BlackFridayStrip({ label, cheapest, shipping, checked, preorder, cue, tcgplayerHref, country, name }: BlackFridayStripData) {
  if (!cheapest && !preorder && !cue) return null;
  return (
    <section aria-label={`${label} price check`} data-bf-strip="" className="card-surface mb-4 px-4 py-3 text-sm leading-6">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="chip bg-ink-800 font-semibold text-white">{label} check</span>
        {cheapest && (
          <span className="text-slate-300">
            Cheapest today <b className="num font-semibold text-white">{cheapest}</b>
          </span>
        )}
        {shipping && <span className="font-medium text-emerald-400">{shipping}</span>}
        {checked && <CheckedAgo iso={checked} className="text-slate-400" />}
        {preorder && <span className="font-medium text-amber-300">{preorder}</span>}
        {cue && <span className={cue.lowest ? "font-semibold text-emerald-400" : "text-slate-400"}>{cue.text}</span>}
      </p>
      {tcgplayerHref && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 border-t border-ink-800 pt-2">
          <span className="rounded border border-ink-700 px-1.5 text-[11px] font-semibold uppercase leading-5 text-slate-400">Ad</span>
          <OutboundLink
            href={tcgplayerHref}
            retailer="tcgplayer"
            country={country ?? "US"}
            kind="sealed"
            cardName={name}
            pageType="sealed_page"
            surface="bf_strip"
            className="font-semibold text-white underline decoration-ink-600 underline-offset-2 hover:decoration-white"
          >
            See {label} prices on TCGplayer →
          </OutboundLink>
        </p>
      )}
    </section>
  );
}
