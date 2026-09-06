import type { Metadata } from "next";
import Link from "next/link";
import { getAllTimeRecords, RECORDS_LIST_SIZE, type RecordRow } from "@/lib/market-records";
import { getCrossRegionGaps, type CrossRegionGap } from "@/lib/arbitrage";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { MarketSectionNav } from "@/components/MarketSectionNav";
import { AnswerBox } from "@/components/AnswerBox";
import { HubFaq } from "@/components/HubFaq";
import { AdSlot } from "@/components/AdSlot";
import { Reveal } from "@/components/Reveal";
import { faqPage } from "@/lib/jsonld";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { COUNTRIES, DEFAULT_COUNTRY, normalizeCountry, currencyOf, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";

// searchParams-driven (?market=), so dynamic for exactly the reason the /market
// page documents at length: an ISR window on a route that reads searchParams,
// with a loading.tsx above it, served the SPINNER as the complete response for
// the first request to each unseen ?market= value. The real caching lives one
// layer down — getAllTimeRecords is day-cached per market, and getCrossRegionGaps
// reads only Card columns — so this page still touches Postgres at most once per
// market per Sydney day regardless of traffic.
export const dynamic = "force-dynamic";

/** How many gap rows the free board shows. Deal Finder has the full screener. */
const GAPS_SHOWN = 10;
/**
 * Candidates to consider before re-ranking — effectively "all of them".
 *
 * Costs nothing extra. computeCrossRegionRows memoizes the built row list per
 * market for 15 minutes and getCrossRegionGaps just slices it, so page size only
 * changes how much of an already-in-memory array comes back. The eligible set is
 * already narrowed to cards at least XREGION_MIN_GAP_PCT (20%) cheaper
 * elsewhere, so 500 covers it with room to spare.
 *
 * It has to be this generous BECAUSE the underlying list is sorted by
 * percentage: a $300 card 22% cheaper abroad is a ~$66 saving and belongs at the
 * top of this board, but it can sit deep in a percentage ranking behind dozens
 * of commons. A small pool would never fetch it to re-rank.
 */
const GAPS_CANDIDATES = 500;
/**
 * Minimum absolute saving, in the home market's cents, for a row to appear.
 *
 * WHY THIS EXISTS — it was added after watching the live board. getCrossRegionGaps
 * ranks by PERCENTAGE, which is right for the Premium screener (sortable, paged,
 * used by someone who knows what they are looking at) and wrong for a public
 * top-10. Percentage systematically promotes the cheapest cards: the first
 * board we shipped led with a common at S$0.50 vs US$3.99 and called it "−90.7%",
 * while a Showcase Signature with a genuine US$44 gap sat at #8. Every one of
 * those headline rows was a saving of two or three dollars — less than the
 * postage, on a card nobody ships internationally.
 *
 * $5 is deliberately a blunt instrument applied to whichever currency the
 * visitor's market uses (the five are within ~1.6× of each other, so a
 * per-currency table would be false precision). It is not "this is worth
 * doing" — international postage on a single card is realistically $5-15, and
 * the caveat below says so. It is the floor below which a row is certainly
 * noise.
 */
const GAP_MIN_SAVING_CENTS = 500;

const TITLE = "Riftbound All-Time Price Records & Cross-Market Gaps";
const DESCRIPTION =
  "Riftbound all-time high and low card prices with the date each record was set, plus the biggest price gaps between markets — every row linked to a store you can actually buy from. Updated daily.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | RiftCompare` },
  description: DESCRIPTION,
  keywords: [
    "Riftbound all-time high",
    "Riftbound record card prices",
    "Riftbound price records",
    "Riftbound price gap",
    "Riftbound cheapest market",
    "Riftbound card price history",
  ],
  alternates: pageAlternates("/market/records"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/market/records" }),
};

function parseMarket(v: string | undefined): Country {
  return v ? normalizeCountry(v) : DEFAULT_COUNTRY;
}

/** "12 Jun 2026" — records are historical, so the year is never redundant. */
function prettyDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

function CardCell({ card }: { card: RecordRow["card"] }) {
  return (
    <Link href={cardHref(card)} className="flex min-w-0 items-center gap-2 hover:text-brand-300">
      {card.imageThumbUrl && (
        // Empty alt + aria-hidden: the card name/set/collector text right beside it
        // already describes this thumbnail — same convention as /c/[token]'s
        // holdings list and UserMenu.tsx's avatar.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageThumbUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded object-cover" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{cardDisplayName(card.name, card)}</span>
        <span className="block text-[11px] text-slate-500">
          {card.setCode} · {card.collectorNumber}
        </span>
      </span>
    </Link>
  );
}

/**
 * One records board.
 *
 * `metric` is what the board is RANKED by and is always the right-hand column,
 * so the reader can see why a row is where it is. Bilgewater's equivalent page
 * ranks without showing the ranking figure, which makes the order look arbitrary.
 */
function RecordsBoard({
  id,
  heading,
  blurb,
  rows,
  currency,
  metric,
}: {
  id: string;
  heading: string;
  blurb: string;
  rows: RecordRow[];
  currency: string;
  metric: (r: RecordRow) => { value: string; sub: string | null; tone?: "up" | "down" };
}) {
  if (rows.length === 0) return null;
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-extrabold text-white">{heading}</h2>
      <p className="mt-1 text-sm text-slate-400">{blurb}</p>
      <ol className="mt-3 divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60">
        {rows.map((r, i) => {
          const m = metric(r);
          return (
            <li key={r.card.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="num w-5 shrink-0 text-center text-xs font-bold text-slate-600">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <CardCell card={r.card} />
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={`num text-sm font-extrabold ${
                    m.tone === "up" ? "text-brand-400" : m.tone === "down" ? "text-rose-400" : "text-white"
                  }`}
                >
                  {m.value}
                </div>
                {m.sub && <div className="text-[11px] text-slate-500">{m.sub}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-slate-600">
        Prices are the lowest in-stock price we recorded across every tracked store in this market, one point per day.
      </p>
    </section>
  );
}

function GapsBoard({
  gaps,
  homeCountry,
}: {
  gaps: { gap: CrossRegionGap; savingCents: number }[];
  homeCountry: Country;
}) {
  if (gaps.length === 0) return null;
  const home = COUNTRIES[homeCountry];
  return (
    <section id="gaps" className="scroll-mt-24">
      <h2 className="text-xl font-extrabold text-white">Biggest cross-market price gaps</h2>
      <p className="mt-1 text-sm text-slate-400">
        Cards that cost meaningfully less in another tracked market than they do in {home.place}, ranked by how much you would
        actually save. Converted at today&apos;s rates so the two figures are comparable.
      </p>
      <ol className="mt-3 divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-950/60">
        {gaps.map(({ gap: g, savingCents }, i) => (
          <li key={g.card.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="num w-5 shrink-0 text-center text-xs font-bold text-slate-600">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <CardCell card={g.card} />
            </div>
            {/* The saving leads and the percentage is secondary, matching how the
                board is now ranked. A number that is not what the list is sorted
                by must not be the biggest thing in the row. */}
            <div className="shrink-0 text-right">
              <div className="num text-sm font-extrabold text-brand-400">
                {formatMoney(savingCents, g.homeCurrency)} less
              </div>
              <div className="text-[11px] text-slate-500">
                {COUNTRIES[g.awayCountry].flag} {formatMoney(g.awayCentsNative, g.awayCurrency)} vs{" "}
                {formatMoney(g.homeCents, g.homeCurrency)} · −{g.gapPct}%
              </div>
            </div>
          </li>
        ))}
      </ol>
      {/* The honest caveat. A gap is not a saving until the card is in your hands,
          and none of international postage, customs or whether that market's
          stores ship abroad is modelled here — the same disclaimer the Premium
          screener carries, because the number means exactly the same thing. */}
      <p className="mt-2 text-[11px] text-slate-600">
        Informational: shipping internationally, customs and whether an overseas store ships to you are not included, and can
        easily exceed the gap.{" "}
        <Link href="/tools/deal-finder?view=xregion" className="text-brand-400 hover:underline">
          The full sortable screener is in Deal Finder
        </Link>
        .
      </p>
    </section>
  );
}

export default async function MarketRecordsPage({ searchParams }: { searchParams: { market?: string } }) {
  const country = parseMarket(searchParams.market);
  const info = COUNTRIES[country];
  const currency = currencyOf(country);

  const [records, gapPage] = await Promise.all([
    getAllTimeRecords(country, RECORDS_LIST_SIZE),
    getCrossRegionGaps(country, 1, GAPS_CANDIDATES),
  ]);

  // Re-rank by MONEY, not percentage — see GAP_MIN_SAVING_CENTS. Done here
  // rather than in getCrossRegionGaps because that function is shared with the
  // Premium screener, where percentage ranking is the right default and a
  // dollar floor would silently hide rows a paying user asked to see.
  const gaps = gapPage.items
    .map((g) => ({ gap: g, savingCents: g.homeCents - g.awayCentsConverted }))
    .filter((r) => r.savingCents >= GAP_MIN_SAVING_CENTS)
    .sort((a, b) => b.savingCents - a.savingCents)
    .slice(0, GAPS_SHOWN);

  const asOf = prettyDay(records.asOf);
  const hasRecords = records.peaks.length > 0 || records.offPeak.length > 0 || records.atLow.length > 0;
  const hasAnything = hasRecords || gaps.length > 0;

  const sections = [
    ...(gaps.length ? [{ id: "gaps", label: "Price gaps" }] : []),
    ...(records.peaks.length ? [{ id: "highs", label: "All-time highs" }] : []),
    ...(records.offPeak.length ? [{ id: "off-peak", label: "Off their peak" }] : []),
    ...(records.atLow.length ? [{ id: "lows", label: "At all-time lows" }] : []),
  ];

  const FAQS = [
    {
      q: "What does an all-time high mean on RiftCompare?",
      a: `The highest daily price we have ever recorded for that card in ${info.place}, where the daily price is the cheapest in-stock listing across every store we track that day. It is a real price somebody could have paid, not an average or an estimate.`,
    },
    {
      q: "How far back does the record go?",
      a: "As far back as our daily price history for that market. A card needs at least two weeks of recorded days before it can appear here at all — a card priced on three days technically has an all-time high, and it would not mean anything.",
    },
    {
      q: "Can I actually buy at the cross-market price?",
      a: "Sometimes. The gap is real — it is two live in-stock prices converted into one currency — but international postage, customs and whether that market's stores ship to you are not included, and on a cheap card they will usually swallow the gap entirely. It is most useful on expensive singles.",
    },
    {
      q: "How often does this update?",
      a: "Once a day, after the price import runs. Every figure carries the date it was set, so you can see exactly how current a record is.",
    },
  ];
  const faqLd = faqPage(FAQS);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Market Index", item: `${SITE_URL}/market` },
      { "@type": "ListItem", position: 3, name: "Price Records", item: `${SITE_URL}/market/records` },
    ],
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
          <Link href="/market" className="hover:text-brand-400">
            Market Index
          </Link>{" "}
          / <span className="text-slate-400">Price records</span>
        </nav>
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Riftbound price records &amp; market gaps</h1>
        <p className="text-slate-400">
          Every all-time high and low we have on record for {info.flag} {info.place}, with the date each was set — plus the
          cards priced furthest apart between markets. Unlike a reference price, every row here links to the stores actually
          listing the card.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <MarketSwitcher
            value={country}
            basePath="/market/records"
            label="Choose the market these records cover"
          />
          {asOf && <span className="text-xs text-slate-500">Latest data {asOf}</span>}
        </div>
      </header>

      {!hasAnything ? (
        <AnswerBox heading="No records yet">
          We do not have enough recorded price history for {info.place} to publish records here yet. Records need at least two
          weeks of daily prices behind them, and we would rather show nothing than call a three-day-old price an all-time
          high.{" "}
          <Link href="/movers" className="text-brand-400 hover:underline">
            This week&apos;s movers
          </Link>{" "}
          work from a shorter window.
        </AnswerBox>
      ) : (
        <>
          <AnswerBox
            points={[
              `Records cover ${info.flag} ${info.place} and are priced in ${currency}.`,
              "A day's price is the cheapest in-stock listing across every store we track that day.",
              "Cards need 14+ days of history before they can hold a record.",
            ]}
          >
            An all-time high here is a price someone could genuinely have paid — the cheapest live in-stock listing on the day
            it was set, not a market average. The cross-market board below shows where the same card is listed cheaper
            somewhere else right now.
          </AnswerBox>

          {sections.length > 1 && <MarketSectionNav sections={sections} />}

          <Reveal>
            <GapsBoard gaps={gaps} homeCountry={country} />
          </Reveal>

          <AdSlot />

          <Reveal>
            <RecordsBoard
              id="highs"
              heading="All-time highs"
              blurb={`The most expensive a card has ever been in ${info.place}, and the day it got there.`}
              rows={records.peaks}
              currency={currency}
              metric={(r) => ({
                value: formatMoney(r.peakCents, currency),
                sub: prettyDay(r.peakDay) ? `set ${prettyDay(r.peakDay)}` : `${r.days} days tracked`,
              })}
            />
          </Reveal>

          <Reveal>
            <RecordsBoard
              id="off-peak"
              heading="Furthest below their all-time high"
              blurb="Cards trading well under their own record. The buyable version of a records board — every one of these is in stock now."
              rows={records.offPeak}
              currency={currency}
              metric={(r) => ({
                value: `−${r.offPeakPct}%`,
                sub: `${formatMoney(r.nowCents, currency)} · peak ${formatMoney(r.peakCents, currency)}`,
                tone: "up",
              })}
            />
          </Reveal>

          <Reveal>
            <RecordsBoard
              id="lows"
              heading="At their all-time low"
              blurb="Cards sitting at, or within a couple of percent of, the cheapest we have ever recorded them."
              rows={records.atLow}
              currency={currency}
              metric={(r) => ({
                value: formatMoney(r.nowCents, currency),
                sub: prettyDay(r.troughDay) ? `low set ${prettyDay(r.troughDay)}` : `${r.days} days tracked`,
                tone: "down",
              })}
            />
          </Reveal>
        </>
      )}

      <HubFaq faqs={FAQS} />

      <nav className="flex flex-wrap gap-2 border-t border-ink-800 pt-6 text-sm">
        <Link href="/market" className="chip border border-ink-700 px-3 py-1.5 hover:border-brand-500">
          The RiftCompare Index →
        </Link>
        <Link href="/movers" className="chip border border-ink-700 px-3 py-1.5 hover:border-brand-500">
          This week&apos;s movers →
        </Link>
        <Link href="/tools/deal-finder" className="chip border border-ink-700 px-3 py-1.5 hover:border-brand-500">
          Deal Finder →
        </Link>
      </nav>
    </div>
  );
}
