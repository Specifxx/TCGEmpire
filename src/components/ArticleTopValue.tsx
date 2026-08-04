import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getValuableCards } from "@/lib/cheapest-cards";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { COUNTRIES, pickPrice, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import type { CardTileData } from "./CardTile";

/**
 * The live "most expensive cards right now" table an article can attach to
 * itself with `Article.topValue`.
 *
 * WHY THIS INSTEAD OF NUMBERS IN THE PROSE: the content pack's own note on the
 * "Most Expensive Riftbound Cards" piece says the figures must come from live
 * data rather than being typed into the body, because this market reprices
 * daily. A hardcoded top-10 is wrong within a week and then stays wrong — and it
 * is exactly the kind of stale, unverifiable list that an answer engine learns
 * not to cite. So the article argues about WHY cards are expensive (durable) and
 * this block supplies WHICH ones are (live).
 *
 * The query is getValuableCards() from lib/cheapest-cards.ts — the
 * price-desc-by-market query that already existed for this shape of question.
 *
 * COUNTRY IS EXPLICIT, never defaulted: getValuableCards defaults to AU while
 * the site's DEFAULT_COUNTRY is US, and the currency label is derived from the
 * SAME country value, so the figures and the symbol can't disagree (the failure
 * mode lib/market-rows.ts documents having already shipped once).
 */
function topValueCached(country: Country, take: number): Promise<CardTileData[]> {
  return unstable_cache(
    async () => {
      try {
        return await getValuableCards(take, country);
      } catch {
        // No database (build sandbox) or a query failure — the article renders
        // without the block rather than failing the page.
        return [];
      }
    },
    ["rc-article-top-value", country, String(take)],
    // Refreshed on demand by revalidateContent() after each price import, with a
    // 24h TTL as the fallback — the pattern lib/content/site-median.ts uses.
    { revalidate: 86400, tags: [CONTENT_TAG] }
  )();
}

export async function ArticleTopValue({
  country,
  take = 10,
  heading,
}: {
  country: Country;
  take?: number;
  heading?: string;
}) {
  const cards = await topValueCached(country, take);
  if (!cards.length) return null;

  const meta = COUNTRIES[country];
  const title = heading ?? `The most expensive Riftbound cards in ${meta.place} right now`;

  return (
    <section className="mt-10" id="live-most-expensive">
      <h2 className="scroll-mt-24 text-xl font-extrabold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">
        Live from the RiftCompare database — the highest current prices across every {meta.adjective} store and
        marketplace we track, in {meta.currency}. Updated with each price import, so this list re-ranks itself as the
        market moves.
      </p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Most expensive Riftbound cards by lowest live price in {meta.place}
          </caption>
          <thead>
            <tr className="bg-ink-850">
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">#</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">Card</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">Set</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 text-right font-semibold text-white">
                Lowest live price
              </th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c, i) => {
              const cents = pickPrice(c, country);
              return (
                <tr key={c.id} className="odd:bg-ink-900/40">
                  <td className="border-b border-ink-800 px-3 py-2 font-bold text-slate-500">{i + 1}</td>
                  <td className="border-b border-ink-800 px-3 py-2">
                    <Link href={cardHref(c)} className="flex items-center gap-2.5 text-white hover:text-brand-400">
                      {c.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.imageThumbUrl}
                          alt={cardImageAlt(c)}
                          width={28}
                          height={39}
                          loading="lazy"
                          decoding="async"
                          className="h-10 w-7 shrink-0 rounded-sm object-cover"
                        />
                      )}
                      <span className="font-semibold">{cardDisplayName(c.name, c)}</span>
                    </Link>
                  </td>
                  <td className="border-b border-ink-800 px-3 py-2 text-slate-400">
                    {c.setName} · {c.collectorNumber}
                  </td>
                  <td className="num border-b border-ink-800 px-3 py-2 text-right font-bold text-accent">
                    {cents != null ? formatMoney(cents, meta.currency) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Prices are the lowest live in-stock listing we can see, including the stores and marketplaces tracked for{" "}
        {meta.place}. <Link href="/movers" className="text-brand-400 underline">Check the daily movers</Link> before
        you buy — a card at the top of this table may be mid-spike.
      </p>
    </section>
  );
}
