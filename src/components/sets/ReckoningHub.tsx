import Link from "next/link";
import { getPreorderGroups } from "@/lib/sealed-import";
import { PreorderPriceTable, preorderTableGroups } from "@/components/PreorderPriceTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { HubFaq } from "@/components/HubFaq";
import { ebayLabel, ebaySealedQuery, ebaySearchUrl } from "@/lib/affiliate";
import { COUNTRIES, COUNTRY_LIST, type Country } from "@/lib/country";
import { MarketSlots } from "@/components/MarketSlots";
import { championBySlug } from "@/lib/champions";
import {
  RECKONING_RELEASE_DATE,
  RECKONING_PRERIFT_START,
  RECKONING_PRERIFT_END,
  RECKONING_TOTAL_CARDS,
  RECKONING_SHOWCASE_COUNT,
  RECKONING_LEGENDS_CONFIRMED,
  RECKONING_LEGENDS_TOTAL,
  RECKONING_LEGENDS_UNREVEALED,
  RECKONING_PRODUCTS,
  RECKONING_FAQ,
  RECKONING_SET_CODE,
  isBeforeReckoningRelease,
} from "@/lib/sets/reckoning";

// The content hub for /sets/the-reckoning while it has no cards (2026-11-24), LegacyHub's shape kept short: facts
// grid, Legends, products with the live cross-store pre-order table (stores first, eBay below), the timeline and the
// FAQ behind the page's FAQPage JSON-LD (one array, lib/sets/reckoning.ts). It is what earns REC's `hubReady`.
// Self-contained: it reads its own pre-orders (a self-caching loader, never wrapped).
function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

const TIMELINE = [
  { key: "legacy", label: "Legacy releases", start: "2027-01-29", end: null, note: "Set 6 comes first", href: "/sets/legacy" },
  { key: "prerift", label: "Pre-Rift events", start: RECKONING_PRERIFT_START, end: RECKONING_PRERIFT_END, note: "Sealed play at local stores", href: null },
  { key: "release", label: "Worldwide release", start: RECKONING_RELEASE_DATE, end: null, note: "Singles get live prices here", href: null },
] as const;

export async function ReckoningHub({ country }: { country: Country }) {
  const preRelease = isBeforeReckoningRelease();
  // One block per live market; MarketSlots shows the visitor's (the set page is one CDN copy per URL).
  const markets = await Promise.all(
    COUNTRY_LIST.map(async ({ code }) => {
      const groups = preRelease
        ? (await getPreorderGroups(code).catch(() => [])).filter((g) => g.setCode === RECKONING_SET_CODE)
        : [];
      return { country: code, currency: COUNTRIES[code].currency, listed: preorderTableGroups(groups), ebay: ebayLabel(code) };
    }),
  );
  void country;

  const now = Date.now();
  const nextIdx = TIMELINE.findIndex((t) => new Date(`${t.end ?? t.start}T23:59:59Z`).getTime() >= now);

  return (
    <section className="card-surface mb-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-extrabold text-white">The Reckoning: what&apos;s confirmed</h2>
        <span className="chip bg-gold/15 text-[11px] font-bold uppercase tracking-wide text-gold [font-feature-settings:'lnum'_1]">
          Set 7 · {preRelease ? "releases" : "released"} {fmtDate(RECKONING_RELEASE_DATE)}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Release date</dt>
          <dd className="mt-0.5 font-semibold text-white">{fmtDate(RECKONING_RELEASE_DATE)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Set size</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {RECKONING_TOTAL_CARDS} cards <span className="text-slate-400">({RECKONING_SHOWCASE_COUNT} Showcase)</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Legends</dt>
          <dd className="mt-0.5 font-semibold text-white">
            {RECKONING_LEGENDS_UNREVEALED > 0 ? <>{RECKONING_LEGENDS_CONFIRMED.length} of {RECKONING_LEGENDS_TOTAL} named</> : <>{RECKONING_LEGENDS_TOTAL}</>}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Set code</dt>
          <dd className="mt-0.5 font-semibold text-white">{RECKONING_SET_CODE}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          {RECKONING_LEGENDS_UNREVEALED > 0 ? "Confirmed Legends" : "Legends"}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {RECKONING_LEGENDS_CONFIRMED.map((legend) => (
            <Link
              key={legend.slug}
              id={legend.slug}
              href={championBySlug(legend.slug) ? `/champions/${legend.slug}` : `/browse?q=${encodeURIComponent(legend.name)}`}
              className="chip scroll-mt-header border border-gold/30 bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/20"
            >
              {legend.name}
            </Link>
          ))}
          {RECKONING_LEGENDS_UNREVEALED > 0 && (
            <span className="chip border border-ink-700 px-3 py-1.5 text-sm text-slate-400">+{RECKONING_LEGENDS_UNREVEALED} unrevealed</span>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Products</h3>
        <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {RECKONING_PRODUCTS.map((p) => (
            <li key={p.name} className="rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2">
              <span className="font-semibold text-white">{p.name}</span>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{p.detail}.</p>
            </li>
          ))}
        </ul>

        <MarketSlots
          slots={Object.fromEntries(
            markets.map(({ country, currency, listed, ebay }) => [
              country,
              <div key={country}>
                {preRelease && listed.length > 0 ? (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pre-order prices, every store</h3>
                    <div className="mt-2">
                      <PreorderPriceTable groups={listed} country={country} currency={currency} page="/sets/the-reckoning" />
                    </div>
                  </div>
                ) : preRelease ? (
                  <p className="mt-4 text-sm text-slate-400">
                    None of our tracked stores in your market has opened a Reckoning pre-order yet.{" "}
                    <Link href="/preorders/the-reckoning" className="text-brand-300 underline-offset-2 hover:underline">
                      See every market →
                    </Link>
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-slate-400">
                    The Reckoning is out.{" "}
                    <Link href="/sealed" className="text-brand-300 underline-offset-2 hover:underline">
                      Compare sealed prices →
                    </Link>
                  </p>
                )}

                <EbaySearchPanel
                  heading="Also on eBay"
                  sub={`Searches of ${ebay}, separate from the store prices above.`}
                  country={country}
                  pageType="set_hub"
                  headingLevel={3}
                  className="mt-4"
                  links={[
                    {
                      label: `Search ${ebay} for Reckoning booster boxes`,
                      href: ebaySearchUrl(country, ebaySealedQuery("The Reckoning Booster Box", "Booster Box"), "reckoning-hub-box"),
                    },
                    {
                      label: `Search ${ebay} for Reckoning Vaults and Champion Decks`,
                      href: ebaySearchUrl(country, "Riftbound Reckoning (vault,bundle,champion deck)", "reckoning-hub-bundle"),
                    },
                  ]}
                />
              </div>,
            ]),
          )}
        />
        {preRelease && (
          <Link href="/preorders/the-reckoning" className="mt-3 inline-block text-sm font-semibold text-brand-300 underline-offset-2 hover:underline">
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
              <p className={`mt-2 text-sm font-bold ${i === nextIdx ? "text-gold" : "text-white"}`}>
                {t.href ? <Link href={t.href} className="hover:underline">{t.label}</Link> : t.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{t.end ? `${fmtShort(t.start)} – ${fmtDate(t.end)}` : fmtDate(t.start)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{t.note}</p>
            </li>
          ))}
        </ol>
      </div>

      <HubFaq faqs={RECKONING_FAQ} heading="The Reckoning: frequently asked questions" className="mt-8" />
    </section>
  );
}
