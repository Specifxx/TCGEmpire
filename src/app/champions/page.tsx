import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { COUNTRIES, DEFAULT_COUNTRY, priceField } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { CHAMPIONS, championCardWhere } from "@/lib/champions";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumb } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Riftbound Champions — Every Card by Champion & Live Prices | RiftCompare" },
  description:
    "Browse every Riftbound champion and see all their cards across every set, with live prices compared across stores — cheapest printing, most valuable printing and what a full set costs.",
  alternates: { canonical: "/champions" },
  openGraph: {
    title: "Riftbound Champions | RiftCompare",
    description: "Every Riftbound champion's cards, with live multi-store prices.",
    url: `${SITE_URL}/champions`,
  },
};

export default async function ChampionsIndexPage() {
  const country = DEFAULT_COUNTRY;
  const field = priceField(country);
  const currency = COUNTRIES[country].currency;

  // One aggregate per champion. 82 small COUNT/MIN/MAX queries would be wasteful
  // per-request, but this page is ISR-cached for 24h and revalidated on import,
  // so it runs roughly twice a day — the same budget /decks and /sets already use.
  // Each query is scoped to one champion's name prefixes, never a whole-table read
  // (see the egress rules in lib/db.ts).
  const rows = await Promise.all(
    CHAMPIONS.map(async (c) => {
      try {
        const where = championCardWhere(c);
        const [count, agg] = await Promise.all([
          prisma.card.count({ where }),
          prisma.card.aggregate({ where, _min: { [field]: true }, _max: { [field]: true } } as never),
        ]);
        const a = agg as unknown as Record<string, Record<string, number | null>>;
        return { champ: c, count, cheapest: a._min[field], dearest: a._max[field] };
      } catch {
        return { champ: c, count: 0, cheapest: null, dearest: null };
      }
    })
  );
  // Champions with no cards are omitted entirely rather than rendered as an empty
  // row — a link to a hub that would 404 is worse than no link.
  const live = rows.filter((r) => r.count > 0);
  const totalCards = live.reduce((n, r) => n + r.count, 0);

  const trail = [{ name: "Champions", href: "/champions" }];

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
            },
          ]),
        }}
      />

      <div>
        <Breadcrumbs trail={trail} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Riftbound champions</h1>
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
    </div>
  );
}
