"use client";

import Link from "next/link";
import { OutboundLink } from "@/components/OutboundLink";
import { useCountry } from "@/components/CountryProvider";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardImageAlt } from "@/lib/image-alt";
import type { ProofStripPick } from "@/lib/proof-strip";

// The homepage's "proof strip" — replaces the old "How RiftCompare works"
// three-step explainer (still there in full on /about, via <HowItWorks>) with
// the PCPartPicker pattern instead: show the product doing its one job on one
// real, popular card, rather than describe the mechanic in the abstract.
// Deliberately compact — "well under half a screen" per the redesign brief —
// so it reads as a proof point on the way down the page, not a fourth hero.
//
// Server-serialized for all six markets (`pickByCountry`) so this localises
// to the visitor's actual market client-side, same pattern as the deals row
// right below it: the homepage itself is ISR-cached and market-neutral (see
// app/page.tsx), so a per-market figure can only be picked after hydration.
// A market with fewer than three distinct in-stock stores for every popular
// candidate hides the section entirely — a thin "compare 2 prices" strip
// would undercut the exact point it's trying to prove.
export function ProofStrip({ pickByCountry }: { pickByCountry: Record<Country, ProofStripPick | null> }) {
  const { country } = useCountry();
  const pick = pickByCountry[country];
  if (!pick) return null;

  const currency = COUNTRIES[country].currency;
  const fmt = (cents: number) => formatMoney(cents, currency);

  return (
    <section aria-labelledby="proof-strip-heading" className="card-surface p-5 sm:p-6">
      <h2 id="proof-strip-heading" className="text-sm font-bold uppercase tracking-wide text-slate-400">
        Real prices, side by side
      </h2>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link href={pick.href} className="flex shrink-0 items-center gap-3 sm:w-52">
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-ink-900">
            {pick.card.imageThumbUrl && (
              // Fixed-size box already reserves the layout space — same
              // reasoning as MarketPulse's PulseCard for a thumbnail this small.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pick.card.imageThumbUrl}
                alt={cardImageAlt(pick.card)}
                width={44}
                height={64}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{pick.card.name}</div>
            <div className="text-xs text-slate-500">
              {pick.card.setCode} · {pick.card.collectorNumber}
            </div>
          </div>
        </Link>

        <div className="grid flex-1 grid-cols-3 gap-2">
          {pick.stores.map((s, i) => (
            <OutboundLink
              key={s.retailer}
              href={s.buyHref}
              retailer={s.retailer}
              country={country}
              cardId={pick.card.id}
              cardName={pick.card.name}
              price={s.deliveredCents / 100}
              positionInList={i + 1}
              pageType="homepage"
              className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center transition-colors sm:p-3 ${
                i === 0
                  ? "border-brand-500 bg-brand-500/10 hover:bg-brand-500/15"
                  : "border-ink-700 bg-ink-900 hover:border-ink-600 hover:bg-ink-800"
              }`}
            >
              {i === 0 && (
                <span className="chip bg-brand-500 text-[10px] font-bold text-ink-950">Cheapest</span>
              )}
              <span className="line-clamp-1 text-[11px] text-slate-400">{s.retailerName}</span>
              <span className="num text-base font-extrabold text-white sm:text-lg">{fmt(s.deliveredCents)}</span>
            </OutboundLink>
          ))}
        </div>
      </div>

      {pick.savingsCents > 0 && (
        <p className="mt-4 text-center text-sm">
          <span className="font-bold text-up">Save {fmt(pick.savingsCents)}</span>{" "}
          <span className="text-slate-400">buying from the cheapest store shown, delivered.</span>
        </p>
      )}
      <p className="mt-1 text-center text-xs text-slate-500">
        Every store, ranked by total delivered cost. Free, no sign-up.
      </p>
    </section>
  );
}
