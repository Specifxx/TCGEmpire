import Link from "next/link";
import { getPreorderGroups } from "@/lib/sealed-import";
import { getDisplayCurrency } from "@/lib/get-country";
import { PreorderPriceTable, preorderTableGroups } from "@/components/PreorderPriceTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { HubFaq } from "@/components/HubFaq";
import { ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import type { Country } from "@/lib/country";
import { championBySlug } from "@/lib/champions";
import {
  LEGACY_RELEASE_DATE,
  LEGACY_PREVIEW_START,
  LEGACY_PRERIFT_START,
  LEGACY_PRERIFT_END,
  LEGACY_TOTAL_CARDS,
  LEGACY_SHOWCASE_COUNT,
  LEGACY_LEGENDS_CONFIRMED,
  LEGACY_LEGENDS_TOTAL,
  LEGACY_LEGENDS_UNREVEALED,
  LEGACY_PRODUCTS,
  LEGACY_FAQ,
  LEGACY_SET_CODE,
  isBeforeLegacyRelease,
} from "@/lib/sets/legacy";

// The content hub for /sets/legacy while it has no cards (2026-11-01, owner:
// "everything we did right for Radiance"): confirmed facts, Legends, products
// with a live cross-store pre-order table, the release timeline, and the FAQ
// that backs the page's FAQPage JSON-LD (one array, lib/sets/legacy.ts). It is
// what earns LGC's `hubReady`, the flag that lets an empty set page be indexed.
// Self-contained like RadianceHub: it reads its own pre-orders (a self-caching
// loader, never wrapped) so the set page's main query is untouched.
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
  { key: "preview", label: "First previews", start: LEGACY_PREVIEW_START, end: null, note: "Convergence Fest, Las Vegas; more in January" },
  { key: "prerift", label: "Pre-Rift events", start: LEGACY_PRERIFT_START, end: LEGACY_PRERIFT_END, note: "Sealed play at local stores" },
  { key: "release", label: "Worldwide release", start: LEGACY_RELEASE_DATE, end: null, note: "Singles get live prices here" },
] as const;

export async function LegacyHub({ country }: { country: Country }) {
  const currency = getDisplayCurrency(country);
  const preRelease = isBeforeLegacyRelease();
  const groups = preRelease
    ? (await getPreorderGroups(country).catch(() => [])).filter((g) => g.setCode === LEGACY_SET_CODE)
    : [];
  const listed = preorderTableGroups(groups);
  const ebay = ebayLabel(country);

  // Server-computed "next" step, like RadianceHub: the crawler and the visitor
  // see the same state.
  const now = Date.now();
  const nextIdx = TIMELINE.findIndex((t) => new Date(`${t.end ?? t.start}T23:59:59Z`).getTime() >= now);

  return (
    <section className="card-surface mb-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-extrabold text-white">Riftbound Legacy: what&apos;s confirmed</h2>
        <span className="chip bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
          Set 6 · {preRelease ? "releases" : "released"} {fmtDate(LEGACY_RELEASE_DATE)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        The first Riftbound set built for draft, and the first to change what a booster pack holds. Every fact below is
        from Riot&apos;s own announcement or the US distributor sheet.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Release date</dt>
          <dd className="mt-0.5 font-semibold text-white">{fmtDate(LEGACY_RELEASE_DATE)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">First previews</dt>
          <dd className="mt-0.5 font-semibold text-white">From {fmtShort(LEGACY_PREVIEW_START)} 2026</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Pre-Rift</dt>
          <dd className="mt-0.5 font-semibold text-white">{fmtShort(LEGACY_PRERIFT_START)} – {fmtShort(LEGACY_PRERIFT_END)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Set size</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {LEGACY_TOTAL_CARDS} cards <span className="text-slate-400">({LEGACY_SHOWCASE_COUNT} Showcase)</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Legends</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {LEGACY_LEGENDS_UNREVEALED > 0 ? <>{LEGACY_LEGENDS_CONFIRMED.length} of {LEGACY_LEGENDS_TOTAL} named</> : <>{LEGACY_LEGENDS_TOTAL}</>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Set code</dt>
          <dd className="mt-0.5 font-semibold text-white">{LEGACY_SET_CODE}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          {LEGACY_LEGENDS_UNREVEALED > 0 ? "Confirmed Legends" : "Legends"}
        </h3>
        {/* Each chip opens the champion's hub (/champions/<slug>): every card of
            theirs across the sets already out, for seven of the eight. Vladimir
            has none yet, so his chip searches instead. */}
        <div className="mt-2 flex flex-wrap gap-2">
          {LEGACY_LEGENDS_CONFIRMED.map((legend) => (
            <Link
              key={legend.slug}
              id={legend.slug}
              href={championBySlug(legend.slug) ? `/champions/${legend.slug}` : `/browse?q=${encodeURIComponent(legend.name)}`}
              className="chip scroll-mt-header border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/20"
            >
              {legend.name}
              {legend.newToGame && <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-300">new</span>}
            </Link>
          ))}
          {LEGACY_LEGENDS_UNREVEALED > 0 && (
            <span className="chip border border-ink-700 px-3 py-1.5 text-sm text-slate-400">+{LEGACY_LEGENDS_UNREVEALED} unrevealed</span>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Seven of the eight already have Riftbound cards; tap one to see what they cost today. Vladimir is new to the game.
        </p>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Products</h3>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {LEGACY_PRODUCTS.map((p) => (
            <li key={p.name} className="rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-white">{p.name}</span>
                {p.msrp && <span className="num shrink-0 text-xs text-slate-400">US MSRP {p.msrp}</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.detail}.</p>
            </li>
          ))}
        </ul>

        {preRelease && listed.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-order prices, every store</h3>
            <div className="mt-2">
              <PreorderPriceTable groups={listed} country={country} currency={currency} page="/sets/legacy" />
            </div>
          </div>
        ) : preRelease ? (
          <p className="mt-4 text-sm text-slate-400">
            None of our tracked stores in your market has opened a Legacy pre-order yet.{" "}
            <Link href="/legacy-preorders" className="text-brand-300 underline-offset-2 hover:underline">
              See the full pre-order comparison →
            </Link>
          </p>
        ) : (
          <p className="mt-4 text-sm text-slate-400">
            Legacy is out.{" "}
            <Link href="/legacy-preorders" className="text-brand-300 underline-offset-2 hover:underline">
              Compare every store&apos;s Legacy booster box price →
            </Link>
          </p>
        )}

        <EbaySearchPanel
          heading="Also on eBay"
          sub={`Searches of ${ebay}, separate from the store prices above. eBay sellers set their own prices and dispatch dates.`}
          country={country}
          pageType="set_hub"
          headingLevel={3}
          className="mt-4"
          links={[
            {
              label: `Search ${ebay} for Legacy booster boxes`,
              href: ebaySearchUrl(country, ebaySealedQuery("Legacy Booster Box", "Booster Box"), "legacy-hub-box"),
            },
            {
              label: `Search ${ebay} for Legacy Vaults and Champion Decks`,
              href: ebaySearchUrl(country, "Riftbound Legacy (vault,bundle,champion deck)", "legacy-hub-bundle"),
            },
          ]}
        />
        {preRelease && (
          <Link href="/legacy-preorders" className="mt-3 inline-block text-sm font-semibold text-brand-300 underline-offset-2 hover:underline">
            Compare every store&apos;s pre-order price →
          </Link>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Release timeline</h3>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {TIMELINE.map((t, i) => (
            <li
              key={t.key}
              className={`rounded-xl border px-4 py-3 ${i === nextIdx ? "border-gold/40 bg-gold/10" : "border-ink-800 bg-ink-900/60"}`}
            >
              <div className={`h-2 w-2 rounded-full ${i === nextIdx ? "bg-gold" : "bg-ink-700"}`} aria-hidden />
              <p className={`mt-2 text-sm font-bold ${i === nextIdx ? "text-gold" : "text-white"}`}>{t.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{t.end ? `${fmtShort(t.start)} – ${fmtDate(t.end)}` : fmtDate(t.start)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.note}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Read before you buy</h3>
        <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
          <li><Link href="/blog/riftbound-legacy-spoilers-set-6" className="text-brand-400 hover:underline">Legacy spoilers: what Riot has shown →</Link></li>
          <li><Link href="/blog/where-to-buy-riftbound-legacy" className="text-brand-400 hover:underline">Where to buy Legacy, by country →</Link></li>
          <li><Link href="/blog/riftbound-legacy-preorders-selling-out" className="text-brand-400 hover:underline">Which Legacy pre-orders are already sold out →</Link></li>
          <li><Link href="/blog/riftbound-legacy-champion-decks" className="text-brand-400 hover:underline">Champion Decks and Proving Grounds 2nd Edition →</Link></li>
          <li><Link href="/blog/riftbound-legacy-pack-changes-and-card-templating" className="text-brand-400 hover:underline">How Legacy packs change →</Link></li>
          <li><Link href="/release-dates" className="text-brand-400 hover:underline">Countdown and release calendar →</Link></li>
        </ul>
      </div>

      <HubFaq faqs={LEGACY_FAQ} heading="Legacy: frequently asked questions" className="mt-8" />
    </section>
  );
}
