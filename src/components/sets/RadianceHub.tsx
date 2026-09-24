import Link from "next/link";
import { getPreorderGroups } from "@/lib/sealed-import";
import { getDisplayCurrency } from "@/lib/get-country";
import { PreorderPriceTable, preorderTableGroups } from "@/components/PreorderPriceTable";
import { HubFaq } from "@/components/HubFaq";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import type { Country } from "@/lib/country";
import {
  RADIANCE_TAGLINE,
  RADIANCE_RELEASE_DATE,
  RADIANCE_PREVIEW_START,
  RADIANCE_PREVIEW_END,
  RADIANCE_PRERIFT_START,
  RADIANCE_PRERIFT_END,
  RADIANCE_TOTAL_CARDS,
  RADIANCE_SHOWCASE_COUNT,
  RADIANCE_LEGENDS_CONFIRMED,
  RADIANCE_LEGENDS_TOTAL,
  RADIANCE_LEGENDS_UNREVEALED,
  RADIANCE_PRODUCTS,
  RADIANCE_FAQ,
  isBeforeRadianceRelease,
} from "@/lib/sets/radiance";

// The visible content hub for /sets/radiance while singles are still in
// spoiler season — confirmed facts, legends, products + a real cross-store
// pre-order table, a release timeline, and the FAQ that backs the page's
// FAQPage JSON-LD (see the array import above: one source of truth for both).
//
// Self-contained and radiance-only, matching PRE_RELEASE_LINKS's own
// per-slug pattern in the parent page rather than trying to generalise a
// "set hub" abstraction from a single example. Fetches its own pre-order
// data (like EbayPicks does its own resolution) so the parent page's main
// query stays untouched.
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

const TIMELINE = [
  { key: "preview", label: "Previews begin", start: RADIANCE_PREVIEW_START, end: RADIANCE_PREVIEW_END },
  { key: "prerift", label: "Pre-Rift events", start: RADIANCE_PRERIFT_START, end: RADIANCE_PRERIFT_END },
  { key: "release", label: "Worldwide release", start: RADIANCE_RELEASE_DATE, end: null },
] as const;

export async function RadianceHub({ country }: { country: Country }) {
  const currency = getDisplayCurrency(country);
  const groups = await getPreorderGroups(country).catch(() => []);
  const listed = preorderTableGroups(groups);

  // Which timeline step is "next" from today, so it can carry the gold accent
  // — server-computed like every other date-driven state on this site (the
  // release-dates countdown, the set page's own comingSoon copy), never a
  // client timer that could show the crawler a different state than a visitor.
  const now = Date.now();
  const nextIdx = TIMELINE.findIndex((t) => new Date(`${t.end ?? t.start}T23:59:59Z`).getTime() >= now);

  return (
    <section className="card-surface animate-fade-up p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-extrabold text-white">Riftbound Radiance — what&apos;s confirmed</h2>
        <span className="chip bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold">
          Set 5 · releases {fmtDate(RADIANCE_RELEASE_DATE)}
        </span>
      </div>
      <p className="mt-1 text-sm italic text-slate-400">&ldquo;{RADIANCE_TAGLINE}&rdquo;</p>

      {/* Confirmed facts */}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Release date</dt>
          <dd className="mt-0.5 font-semibold text-white">{fmtDate(RADIANCE_RELEASE_DATE)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Previews</dt>
          <dd className="mt-0.5 font-semibold text-white">{fmtShort(RADIANCE_PREVIEW_START)} – {fmtShort(RADIANCE_PREVIEW_END)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Pre-Rift</dt>
          <dd className="mt-0.5 font-semibold text-white">{fmtShort(RADIANCE_PRERIFT_START)} – {fmtShort(RADIANCE_PRERIFT_END)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Set size</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {RADIANCE_TOTAL_CARDS} cards <span className="text-slate-400">({RADIANCE_SHOWCASE_COUNT} Showcase)</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Legends</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {RADIANCE_LEGENDS_CONFIRMED.length} of {RADIANCE_LEGENDS_TOTAL} confirmed
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">New rarity</dt>
          <dd className="mt-0.5 font-semibold text-white">Ultimate Rare <span className="text-slate-400">(unrevealed)</span></dd>
        </div>
      </dl>

      {/* Confirmed legends — each chip id-anchored and linked into this same
          page's filtered card view, so it resolves to real cards the moment
          they're revealed and imported. */}
      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Confirmed legends</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {RADIANCE_LEGENDS_CONFIRMED.map((legend) => (
            <Link
              key={legend.slug}
              id={legend.slug}
              href={`/sets/radiance?q=${encodeURIComponent(legend.name)}`}
              className="chip scroll-mt-header border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/20"
            >
              {legend.name}
            </Link>
          ))}
          <span className="chip border border-ink-700 px-3 py-1.5 text-sm text-slate-400">
            +{RADIANCE_LEGENDS_UNREVEALED} unrevealed
          </span>
        </div>
      </div>

      {/* Products & pre-orders */}
      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Products</h3>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {RADIANCE_PRODUCTS.map((p) => (
            <li key={p.name} className="rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-white">{p.name}</span>
                {p.msrp && <span className="num shrink-0 text-xs text-slate-400">MSRP {p.msrp}</span>}
              </div>
              {p.detail && <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.detail}</p>}
            </li>
          ))}
        </ul>

        {listed.length > 0 ? (
          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-order prices, every store</h4>
            <div className="mt-2">
              <PreorderPriceTable groups={listed} country={country} currency={currency} />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            No Radiance pre-orders are tracked in your market yet. <Link href="/radiance-preorders" className="text-brand-300 underline-offset-2 hover:underline">Check the full pre-order comparison →</Link>
          </p>
        )}
        <Link href="/radiance-preorders" className="mt-3 inline-block text-sm font-semibold text-brand-300 underline-offset-2 hover:underline">
          Compare every store&apos;s pre-order price →
        </Link>
      </div>

      {/* Release timeline */}
      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Release timeline</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {TIMELINE.map((t, i) => (
            <li
              key={t.key}
              className={`rounded-xl border px-4 py-3 ${
                i === nextIdx ? "border-gold/40 bg-gold/10" : "border-ink-800 bg-ink-900/60"
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${i === nextIdx ? "bg-gold" : "bg-ink-700"}`} aria-hidden />
              <p className={`mt-2 text-sm font-bold ${i === nextIdx ? "text-gold" : "text-white"}`}>{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {t.end ? `${fmtShort(t.start)} – ${fmtDate(t.end)}` : fmtDate(t.start)}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* Launch capture (2026-09-23): the release-day email (lib/release-day.ts)
          goes to the newsletter list, and no Radiance surface offered that list,
          so spoiler-season visitors — the year's biggest traffic — had no way
          onto it. After the timeline, whose last step is release day, and before
          the FAQ, where a reader who has what they came for leaves. Retires on
          release day with the email it promises. */}
      {isBeforeRadianceRelease() && (
        <div className="mt-6 max-w-lg">
          <NewsletterSignup
            siteName="RiftCompare"
            variant="card"
            source="radiance-launch"
            trackEvent="radiance_notify_click"
            heading="Get an email the day Radiance prices go live"
            cta="Notify me"
            done="You're on the list. We'll email you on release day."
          />
        </div>
      )}

      <HubFaq faqs={RADIANCE_FAQ} heading="Radiance — frequently asked questions" className="mt-8" />
    </section>
  );
}
