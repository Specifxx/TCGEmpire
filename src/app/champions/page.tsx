import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { COUNTRIES, DEFAULT_COUNTRY, priceField } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { CHAMPIONS, championForCardName } from "@/lib/champions";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumb, faqPage } from "@/lib/jsonld";
import { AnswerBox } from "@/components/AnswerBox";
import { HubFaq } from "@/components/HubFaq";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Champions — Every Card by Champion & Live Prices | RiftCompare" },
  description:
    "Browse every Riftbound champion and see all their cards across every set, with live prices compared across stores — cheapest printing, most valuable printing and what a full set costs.",
  alternates: pageAlternates("/champions"),
  openGraph: pageOpenGraph({
    title: "Riftbound Champions | RiftCompare",
    description: "Every Riftbound champion's cards, with live multi-store prices.",
    url: "/champions",
  }),
};

export default async function ChampionsIndexPage() {
  const country = DEFAULT_COUNTRY;
  const field = priceField(country);
  const currency = COUNTRIES[country].currency;

  // ONE query for the whole table, aggregated in JS — not 82 COUNT/MIN/MAX pairs.
  // The first version of this page did exactly that (164 round trips per
  // revalidation) which is both slow and the sort of access pattern that has
  // already exhausted this project's Neon transfer allowance three times.
  //
  // The read is narrow and bounded: only cards whose name carries a comma (the
  // "Champion, Epithet" form — ~230 of ~1,360 rows), and only two columns. That's
  // tens of kilobytes, versus 164 round trips for the same information.
  let rows: { champ: (typeof CHAMPIONS)[number]; count: number; cheapest: number | null; dearest: number | null }[] = [];
  try {
    const named = await prisma.card.findMany({
      where: { name: { contains: "," } },
      select: { name: true, [field]: true } as Record<string, boolean>,
    });
    const acc = new Map<string, { count: number; cheapest: number | null; dearest: number | null }>();
    for (const c of named as unknown as ({ name: string } & Record<string, number | null>)[]) {
      // Resolved through the SAME allowlist the hub pages use, so a champion's
      // row here can't disagree with what its own page renders.
      const champ = championForCardName(c.name);
      if (!champ) continue;
      const cur = acc.get(champ.slug) ?? { count: 0, cheapest: null, dearest: null };
      cur.count += 1;
      const p = c[field];
      if (p != null) {
        if (cur.cheapest == null || p < cur.cheapest) cur.cheapest = p;
        if (cur.dearest == null || p > cur.dearest) cur.dearest = p;
      }
      acc.set(champ.slug, cur);
    }
    rows = CHAMPIONS.map((c) => ({ champ: c, ...(acc.get(c.slug) ?? { count: 0, cheapest: null, dearest: null }) }));
  } catch (e) {
    console.error("champions index: card query failed, rendering the empty state:", e);
  }
  // Champions with no cards are omitted entirely rather than rendered as an empty
  // row — a link to a hub that would 404 is worse than no link.
  const live = rows.filter((r) => r.count > 0);
  const totalCards = live.reduce((n, r) => n + r.count, 0);

  const trail = [{ name: "Champions", href: "/champions" }];

  // Derived from the same rows the table renders, so an answer can never state a
  // number the page contradicts.
  const dearestRow = live.reduce<(typeof live)[number] | null>(
    (best, r) => (r.dearest != null && (best?.dearest == null || r.dearest > best.dearest) ? r : best),
    null
  );
  const FAQS = [
    {
      q: "Which Riftbound champions have cards?",
      a: live.length
        ? `${live.length} League of Legends champions currently have Riftbound cards, across ${totalCards.toLocaleString()} printings. Every one is listed above with its cheapest and most valuable printing.`
        : "Champion pages appear here as cards are imported into the database.",
    },
    {
      q: "How many cards does each Riftbound champion have?",
      a: "It varies by champion and by how many sets they've appeared in — the Cards column above shows the exact count for each, including alternate-art, Signature and promo printings.",
    },
    {
      q: "What is the most expensive Riftbound champion card?",
      a: dearestRow?.dearest != null
        ? `Right now the highest-priced printing on this page belongs to ${dearestRow.champ.name}, at ${formatMoney(dearestRow.dearest, currency)}. Prices move daily, so the table above is the live answer.`
        : "The Most valuable column above shows the highest live price for each champion; prices move daily, so treat the table as the current answer.",
    },
    {
      q: "How do I find the cheapest printing of a champion's card?",
      a: "Open the champion's page. Every printing is listed with its lowest live price across the stores we track, so the cheapest way to get that champion is the top of the list.",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            breadcrumb(trail),
            {
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: "Riftbound Champions",
              url: `${SITE_URL}/champions`,
              isPartOf: { "@id": `${SITE_URL}/#website` },
              publisher: { "@id": `${SITE_URL}/#org` },
            },
            faqPage(FAQS),
          ].filter(Boolean)),
        }}
      />

      <div>
        <Breadcrumbs trail={trail} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound champions</h1>
      <HubIntro path="/champions" />
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {live.length > 0 ? (
            <>
              Every champion with cards in Riftbound — {live.length} champions across {totalCards.toLocaleString()}{" "}
              printings. Open one to see all their cards from every set, each priced live across the stores we track.
            </>
          ) : (
            <>Champion pages appear here as cards are imported.</>
          )}
        </p>
        <AnswerBox className="mt-4">
          <p>
            Every League of Legends champion with a Riftbound card, in one table — with how many printings each has,
            the cheapest one to buy right now, and the most valuable. Open a champion to see every printing priced
            live across the stores we track.
          </p>
        </AnswerBox>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-3 font-semibold">Champion</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Cards</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Cheapest</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Most valuable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {live.map((r) => (
              <tr key={r.champ.slug} className="transition-colors hover:bg-ink-850">
                <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                  <Link href={`/champions/${r.champ.slug}`} className="text-white hover:text-brand-300">
                    {r.champ.name}
                  </Link>
                </th>
                <td className="num px-4 py-2.5 text-right text-slate-400">{r.count}</td>
                <td className="num px-4 py-2.5 text-right text-accent">
                  {r.cheapest != null ? formatMoney(r.cheapest, currency) : "—"}
                </td>
                <td className="num px-4 py-2.5 text-right text-slate-300">
                  {r.dearest != null ? formatMoney(r.dearest, currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Looking for a deck to build?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Each champion page lists every printing with a live price, so you can see the cheapest way to pick them up.
          For full decklists priced end-to-end, see{" "}
          <Link href="/decks" className="text-brand-400 hover:underline">meta decks</Link>, or browse{" "}
          <Link href="/cards" className="text-brand-400 hover:underline">by type, rarity and printing</Link>.
        </p>
      </section>

      <HubFaq faqs={FAQS} className="" />
    </div>
  );
}
