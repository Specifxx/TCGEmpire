import Link from "next/link";

// Homepage feature moment for the Vendetta launch — full-bleed banner using the
// set's own key art, sitting right under the hero so it reads as "the" story on
// the page right now. Static (no cookie/header reads) so it stays on the cached
// ISR render; drop this once Vendetta stops being the newest thing on the site.
export function VendettaFeature() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-500/30">
      <div className="absolute inset-0" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vendetta-hero.png"
          alt=""
          className="h-full w-full scale-105 object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />
      </div>

      <div className="relative flex min-h-[220px] flex-col justify-center gap-3 px-6 py-8 sm:min-h-[260px] sm:px-10">
        <span className="chip inline-flex w-fit bg-brand-500/20 text-[11px] font-bold uppercase tracking-wider text-brand-300">
          New set · live now
        </span>
        <h2 className="max-w-lg font-display text-2xl font-extrabold leading-tight text-white sm:text-4xl">
          Riftbound: Vendetta is here
        </h2>
        <p className="max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
          Pre-Rift launch events kicked off early and Vendetta singles are already trading — days ahead of the
          31 July official street date. All 166 cards are in the database; we&apos;re comparing live prices across
          every store as they land.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link href="/sets/vendetta" className="btn-primary px-5 py-2.5 text-sm sm:text-base">
            Shop Vendetta now →
          </Link>
          <Link
            href="/blog/riftbound-vendetta-is-here-early-release"
            className="btn-ghost px-5 py-2.5 text-sm text-slate-200 sm:text-base"
          >
            Read the story →
          </Link>
        </div>
      </div>
    </div>
  );
}
