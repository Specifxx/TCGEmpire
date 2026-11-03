import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBulkCardSummary } from "@/lib/public-api";
import { latestGradedDay } from "@/lib/price-history-store";
import { GUIDE_GRADES, gradedGuideRows, gradedMultiple, type GradedGuideCard } from "@/lib/graded-guide";
import { ebaySearchUrl } from "@/lib/affiliate";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";

// /graded — the graded price guide (lib/graded-guide.ts; DECISIONS.md, "Graded
// price guide", 2026-10-27). Six hours, like every page buyers act on: the day
// file it reads changes once a day, and the two reads under it (a narrow card
// select for ~150 ids, getBulkCardSummary's own two-day cache) are cheap.
export const revalidate = 21600;

const TITLE = "Riftbound PSA 10 & Graded Card Prices";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | RiftCompare` },
  description:
    "What a PSA 10, PSA 9, BGS or CGC graded Riftbound card costs: the cheapest live eBay listing for every card with a graded copy for sale, beside the cheapest raw copy, updated daily.",
  alternates: pageAlternates("/graded"),
  openGraph: { title: TITLE, url: `${SITE_URL}/graded` },
};

const usd = (c: number) => formatMoney(c, "USD");

export default async function GradedGuidePage() {
  const day = latestGradedDay();
  const ids = Object.keys(day?.prices ?? {});
  const [cards, raw] = await Promise.all([
    ids.length
      ? prisma.card
          .findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true, setName: true, collectorNumber: true }, take: ids.length })
          .catch(() => [] as GradedGuideCard[])
      : Promise.resolve([] as GradedGuideCard[]),
    getBulkCardSummary("US").catch(() => null),
  ]);
  const rawBySlug = new Map<string, number>((raw ?? []).flatMap((e) => (e.slug ? [[e.slug, e.priceCents] as [string, number]] : [])));
  const rows = gradedGuideRows(day, new Map(cards.map((c) => [c.id, c])), rawBySlug);
  const checked = day?.day ? new Date(`${day.day}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Graded prices</span>
      </nav>
      <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">{TITLE}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
        The cheapest live eBay listing for each grade of every Riftbound card with a graded copy for sale, beside the
        cheapest raw copy we track in the US. These are <strong className="text-slate-200">asking prices</strong> of
        listings, not sales, converted to US dollars across the eBay markets we search
        {checked ? <>, checked {checked}</> : null}. A grade column is empty when no listing of that grade was live.
      </p>
      <AffiliateDisclosure partner="ebay" className="mt-2" />

      {rows.length === 0 ? (
        <p className="card-surface mt-6 p-6 text-sm text-slate-400">
          No graded listings today. Every card page shows its graded listings under the eBay panel when there are some.
        </p>
      ) : (
        <div className="card-surface mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-2.5 font-semibold">Card</th>
                {GUIDE_GRADES.map((g) => (
                  <th key={g} className="px-2 py-2.5 text-right font-semibold">{g}</th>
                ))}
                <th className="px-2 py-2.5 text-right font-semibold">Raw</th>
                <th className="px-2 py-2.5 text-right font-semibold" title="PSA 10 price ÷ raw price">PSA 10 ÷ raw</th>
                <th className="px-3 py-2.5 font-semibold">eBay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.card.id} className="border-t border-slate-800 align-middle">
                  <td className="px-3 py-2">
                    <Link href={cardHref(r.card)} className="font-semibold text-white hover:text-brand-300">{r.card.name}</Link>
                    <span className="block text-xs text-slate-500">{r.card.setName} · {r.card.collectorNumber}</span>
                  </td>
                  {GUIDE_GRADES.map((g) => (
                    <td key={g} className="px-2 py-2 text-right tabular-nums text-slate-200">
                      {r.prices[g] ? usd(r.prices[g]) : <span className="text-slate-600">–</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums text-slate-400">{r.rawCents ? usd(r.rawCents) : <span className="text-slate-600">–</span>}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-400">{gradedMultiple(r) ?? <span className="text-slate-600">–</span>}</td>
                  <td className="px-3 py-2 text-xs">
                    <OutboundLink
                      href={ebaySearchUrl("US", `Riftbound ${r.card.name} ${r.top.grade}`, "graded-guide")}
                      retailer="ebay_us"
                      country="US"
                      cardId={r.card.slug ?? r.card.id}
                      cardName={r.card.name}
                      positionInList={i + 1}
                      pageType="graded_guide"
                      surface="ebay_graded"
                      className="font-semibold text-brand-400 hover:underline"
                    >
                      {r.top.grade} on eBay
                    </OutboundLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card-surface mt-6 p-5 text-sm leading-relaxed text-slate-400">
        <h2 className="font-bold text-white">How to read this</h2>
        <p className="mt-2">
          A slab&apos;s asking price is what one seller wants today; the cheapest listing of a grade is the most you
          should need to pay for it right now, not what it is worth. The raw column is the cheapest ungraded copy at a
          store or on eBay in the US, so &ldquo;PSA 10 ÷ raw&rdquo; shows roughly what grading adds on a card. Open a
          card for every graded listing, its graded price history and every store selling it raw.
        </p>
      </section>
    </div>
  );
}
