import Link from "next/link";
import type { Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { formatDay, sourceWord } from "@/lib/pokemon/format";
import { pokemonEbayQuery } from "@/lib/pokemon/ebay-query";
import { KIND_HUBS, hubFacts, hubFaq, hubProse, hubTiles, type KindHub } from "@/lib/pokemon/hubs";
import { pokemonItemList, productIsIndexed } from "@/lib/pokemon/seo";
import { formatPerPack } from "@/lib/pokemon/value";
import type { PkCatalog, PkTile } from "@/lib/pokemon/types";
import { Breadcrumbs } from "../Breadcrumbs";
import { EbaySearchPanel } from "../EbaySearchPanel";
import { AffiliateDisclosure } from "../AffiliateDisclosure";
import { EbayRowLink, PaidLinksMarker } from "./PerPackTable";

// One kind hub (/pokemon/booster-boxes, /elite-trainer-boxes, /booster-bundles):
// every product of the hub's kinds in one table, the sentences written from
// that table's data, a hand-written explainer and an FAQ answered from data.
// The three page files only read the catalogue and pass it here.
//
// Server component: the catalogue never reaches the client. Every row's eBay
// search is built here (customid `pkmn-kindhub`), the table's eBay column is
// marked as paid links, and the disclosure sits directly under the table.

export function KindHubView({
  hub,
  catalog,
  country,
  currency,
  today,
}: {
  hub: KindHub;
  /** The market's catalogue, already in the display currency (lib/pokemon/browse.ts toDisplay). */
  catalog: PkCatalog;
  country: Country;
  currency: string;
  today: string;
}) {
  const tiles = hubTiles(catalog, hub);
  const facts = hubFacts(catalog, hub, today);
  const prose = hubProse(facts, hub, currency);
  const faq = hubFaq(facts, hub, currency);
  const perPack = country !== "SG";
  const indexed = tiles.filter((t) => productIsIndexed(t)).map((t) => ({ name: t.name, path: `/pokemon/sealed/${t.slug}` }));
  const others = KIND_HUBS.filter((h) => h.slug !== hub.slug);

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({ name: hub.h1, href: hub.path, description: hub.description, type: "CollectionPage" }),
            faqPage(faq),
            indexed.length ? pokemonItemList(hub.h1, indexed) : null,
          ),
        }}
      />
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: hub.label, href: hub.path },
        ]}
      />

      <section className="card-surface mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-5 py-6 sm:px-6">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{hub.h1}</h1>
          {prose.length > 0 ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{prose.join(" ")}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-300">No prices yet.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {others.map((h) => (
              <Link key={h.slug} href={h.path} className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
                {h.label}
              </Link>
            ))}
            <Link href="/pokemon/price-per-pack" className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
              Price per pack
            </Link>
            <Link href="/pokemon/sets" className="chip tap-link bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white">
              By set
            </Link>
          </div>
        </div>
      </section>

      {tiles.length > 0 && (
        <section className="mb-8" aria-labelledby="hub-table">
          <h2 id="hub-table" className="scroll-mt-header mb-1 text-lg font-extrabold text-white">
            {hub.label}: cheapest listing{perPack ? " and price per pack" : ""}
            {facts.asOf ? `, ${facts.asOf}` : ""}
          </h2>
          <p className="mb-3 max-w-3xl text-xs text-slate-400">
            Item price, postage extra. Newest set first; products with no set come last.
          </p>
          {!perPack && (
            <p className="mb-3 max-w-3xl rounded-md border border-ink-800 bg-ink-900 px-3 py-2 text-xs text-slate-300">
              We track no listings in Singapore, so there is no price per pack to show here: a per-pack figure divides a
              listing you could buy, and TCGplayer&apos;s converted market price is a reference, not a listing. The eBay column
              searches your own eBay site.
            </p>
          )}
          <HubTable tiles={tiles} currency={currency} country={country} perPack={perPack} />
          <AffiliateDisclosure partner="ebay" />
        </section>
      )}

      {!perPack && (
        <EbaySearchPanel
          heading={`Search eBay for Pokémon ${hub.plural}`}
          sub="A search of your own eBay site. It shows every listing there, not a price we have checked."
          links={[{ label: `Pokémon ${hub.plural}`, href: ebaySearchUrl(country, pokemonEbayQuery(hub.ebayQuery), "pkmn-kindhub") }]}
          country={country}
          pageType="pokemon_kindhub"
          className="mb-8"
        />
      )}

      <section className="card-surface mb-8 space-y-3 p-6 text-sm leading-relaxed text-slate-300">
        <h2 className="text-lg font-extrabold text-white">How this page works</h2>
        {hub.explainer.map((p) => (
          <p key={p.slice(0, 40)}>{p}</p>
        ))}
        <p>
          <Link href="/pokemon/price-per-pack" className="text-brand-400 hover:underline">
            Price per pack across every product type
          </Link>{" "}
          ranks the other kinds the same way.
        </p>
      </section>

      {faq.length > 0 && (
        <section className="card-surface mb-6 p-6">
          <h2 className="mb-3 text-lg font-extrabold text-white">Questions</h2>
          <dl className="space-y-4 text-sm">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-white">{f.q}</dt>
                <dd className="mt-1 text-slate-400">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

// PerPackTable's responsive table, switching at `xl` instead of `md`: seven
// columns need the width, and between those breakpoints the stacked rows read
// better than a table scrolling inside its box.
const XL = {
  box: "card-surface overflow-hidden xl:overflow-x-auto",
  row: "grid grid-cols-1 gap-x-3 gap-y-2 min-[360px]:grid-cols-2 md:grid-cols-3 border-b border-ink-800 px-3 py-3 last:border-b-0 xl:table-row xl:p-0",
  cell: "block xl:table-cell xl:px-2.5 xl:py-2.5 xl:align-middle",
  labelled:
    "before:mb-0.5 before:block before:text-[10px] before:font-semibold before:uppercase before:tracking-wide before:text-slate-500 before:content-[attr(data-label)] xl:before:content-none",
};

function HubTable({ tiles, currency, country, perPack }: { tiles: PkTile[]; currency: string; country: Country; perPack: boolean }) {
  const approx = currency !== "USD";
  return (
    <div className={XL.box}>
      <table className="block w-full text-sm xl:table">
        <caption className="sr-only">Every product of this type with its cheapest tracked listing</caption>
        <thead className="hidden border-b border-ink-800 bg-ink-900/60 text-left text-[11px] uppercase tracking-wide text-slate-500 xl:table-header-group">
          <tr>
            <th scope="col" className="px-2.5 py-2 font-semibold">
              Product
            </th>
            <th scope="col" className="px-2.5 py-2 font-semibold">
              TCGplayer lists
            </th>
            <th scope="col" className="px-2.5 py-2 text-right font-semibold">
              Cheapest listing
            </th>
            <th scope="col" className="px-2.5 py-2 text-right font-semibold">
              Packs
            </th>
            {perPack && (
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Per pack
              </th>
            )}
            <th scope="col" className="border-l border-ink-800 px-2.5 py-2 text-right font-semibold">
              TCGplayer market
            </th>
            <th scope="col" className="px-2.5 py-2 font-semibold">
              eBay
              <PaidLinksMarker />
            </th>
          </tr>
        </thead>
        <tbody className="block xl:table-row-group">
          {tiles.map((t) => {
            const released = formatDay(t.releasedOn);
            return (
              <tr key={t.id} className={XL.row}>
                <td className={`${XL.cell} col-span-full xl:min-w-[13rem]`}>
                  <Link href={`/pokemon/sealed/${t.slug}`} className="font-semibold text-white hover:text-brand-300 hover:underline">
                    {t.name}
                  </Link>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    {t.setName ?? "No set"}
                    {t.kind === "pc-etb" && <span className="chip bg-rose-500/15 text-[10px] font-semibold text-rose-300">Pokémon Center</span>}
                  </span>
                </td>
                <td data-label="TCGplayer lists" className={`${XL.cell} ${XL.labelled} whitespace-nowrap`}>
                  {released ?? "—"}
                  {t.presale && (
                    <span className="chip ml-1.5 bg-sky-500/15 text-[10px] font-semibold text-sky-300 xl:ml-0 xl:mt-1 xl:flex xl:w-fit">Pre-order</span>
                  )}
                </td>
                <td data-label="Cheapest listing" className={`${XL.cell} ${XL.labelled} xl:text-right`}>
                  {t.lowCents != null ? (
                    <>
                      <span className="num font-semibold text-white">{formatMoney(t.lowCents, currency)}</span>{" "}
                      <span className="whitespace-nowrap text-xs text-slate-400">{sourceWord(t.lowSource)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">No tracked listing</span>
                  )}
                </td>
                <td data-label="Packs" className={`${XL.cell} ${XL.labelled} num xl:text-right`}>
                  {t.packCount ?? "—"}
                </td>
                {perPack && (
                  <td data-label="Per pack" className={`${XL.cell} ${XL.labelled} xl:text-right`}>
                    {t.perPackCents != null ? (
                      <span className="num whitespace-nowrap font-bold text-accent">{formatPerPack(t.perPackCents, currency)}</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                )}
                <td
                  data-label="TCGplayer market (reference)"
                  className={`${XL.cell} ${XL.labelled} text-slate-400 xl:border-l xl:border-ink-800 xl:bg-ink-950/40 xl:text-right`}
                >
                  {t.refCents != null ? (
                    <span className="num whitespace-nowrap">
                      {approx ? "≈ " : ""}
                      {formatMoney(t.refCents, currency)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td data-label="eBay (paid link)" className={`${XL.cell} ${XL.labelled}`}>
                  <EbayRowLink
                    href={ebaySearchUrl(country, pokemonEbayQuery(t.name), "pkmn-kindhub")}
                    country={country}
                    pageType="pokemon_kindhub"
                    name={t.name}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
