import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { ebaySearchUrl } from "@/lib/affiliate";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { toDisplay } from "@/lib/pokemon/browse";
import { pokemonFaq } from "@/lib/pokemon/copy";
import { pokemonEbayQuery, pokemonSetEbayQuery } from "@/lib/pokemon/ebay-query";
import { buildHome } from "@/lib/pokemon/home";
import { pokemonItemList, pokemonMeta } from "@/lib/pokemon/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { HomeHero } from "@/components/pokemon/HomeHero";
import { HomePerPack } from "@/components/pokemon/HomePerPack";
import { HomeComingUp } from "@/components/pokemon/HomeComingUp";
import { HomeShopByType } from "@/components/pokemon/HomeShopByType";
import { HomeNewestSets } from "@/components/pokemon/HomeNewestSets";
import { HomeBelowMarket } from "@/components/pokemon/HomeBelowMarket";
import { HomeGuides, type HomeGuide } from "@/components/pokemon/HomeGuides";
import { getPokemonPosts } from "@/lib/pokemon/blog/index";

// The Pokémon section's home page. Per-request like /sealed: the visitor's
// market comes from the cookie (getCountry), and the data from ONE cached
// catalogue read per market (lib/pokemon/data.ts), never a query of its own.
// Everything on it is derived from that read by lib/pokemon/home.ts.
//
// FAIL-OPEN (DECISIONS, the Pokémon panel's D14): a read error is thrown, so
// the response is an HTTP 500, which is neither cached, noindexed nor a soft
// 404. Only a genuinely empty catalogue (no import yet) renders, as a 200 with
// noindex, follow and nothing but "no prices yet": the old catch path told
// visitors the import had not run when the database was simply unreachable.
export const dynamic = "force-dynamic";

const TITLE = "Pokémon Sealed Prices: Booster Boxes, ETBs & Bundles";
const DESCRIPTION =
  "Pokémon booster box, ETB and booster bundle prices from TCGplayer and eBay listings, with the price per pack, from Sword & Shield on. Updated daily.";

export async function generateMetadata(): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const catalog = await getPokemonCatalog(getCountry());
  return pokemonMeta({
    title: TITLE,
    description: DESCRIPTION,
    path: "/pokemon",
    ogImage: "colocated",
    robots: catalog.tiles.length ? undefined : { index: false, follow: true },
  });
}

export default async function PokemonHub() {
  if (!pokemonEnabled()) notFound();
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const showEur = country === "UK" && currency === "EUR";
  const place = COUNTRIES[country].place;
  const raw = await getPokemonCatalog(country);
  const catalog = { ...raw, tiles: toDisplay(raw.tiles, showEur) };
  const home = buildHome(catalog, country, new Date().toISOString().slice(0, 10));
  // This market's sources, not catalog.sources: that one is every market's,
  // so it would name Cardmarket in the US and TCGplayer listings in Singapore.
  const faq = pokemonFaq(home.stats.sources);
  const hasTiles = catalog.tiles.length > 0;
  const ebayTracked = home.stats.listingSources.includes("ebay");
  // Published posts only (getPokemonPosts is the one published filter), and
  // the Discord page only once the app exists: /pokemon/discord 404s without
  // its ID, and this link keeps the sitemapped page from being an orphan.
  const guides: HomeGuide[] = getPokemonPosts()
    .slice(0, 3)
    .map((p) => ({ href: `/pokemon/blog/${p.slug}`, title: p.title, excerpt: p.excerpt }));
  const discordHref = process.env.POKEMON_DISCORD_APP_ID ? "/pokemon/discord" : undefined;

  const newestSet = home.newest[0]?.set;
  const ebayLinks = [
    ...(newestSet ? [{ label: `${newestSet.name} sealed`, href: ebaySearchUrl(country, pokemonSetEbayQuery(newestSet.name), "pkmn-hub") }] : []),
    { label: "Pokémon booster boxes", href: ebaySearchUrl(country, pokemonEbayQuery("booster box"), "pkmn-hub") },
    { label: "Elite Trainer Boxes", href: ebaySearchUrl(country, pokemonEbayQuery("Elite Trainer Box"), "pkmn-hub") },
    { label: "Booster bundles", href: ebaySearchUrl(country, pokemonEbayQuery("booster bundle"), "pkmn-hub") },
    { label: "Ultra-Premium Collections", href: ebaySearchUrl(country, pokemonEbayQuery("Ultra Premium Collection"), "pkmn-hub") },
  ];

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({ name: TITLE, href: "/pokemon", description: DESCRIPTION, type: "CollectionPage" }),
            hasTiles ? faqPage(faq) : null,
            home.newest.length
              ? pokemonItemList(
                  "Newest Pokémon sets",
                  home.newest.map((s) => ({ name: s.set.name, path: `/pokemon/sets/${s.set.slug}` })),
                )
              : null,
          ),
        }}
      />
      <Breadcrumbs trail={[{ name: "Pokémon", href: "/pokemon" }]} />

      <HomeHero stats={home.stats} place={place} converted={currency !== "USD"} discordHref={discordHref} />

      {hasTiles && (
        <>
          <HomePerPack groups={home.perPack} currency={currency} asOf={home.stats.asOf} />
          <HomeComingUp data={home.comingUp} currency={currency} />
          <HomeShopByType types={home.shop} currency={currency} place={place} />
          <HomeNewestSets sets={home.newest} currency={currency} total={home.stats.sets} />
          <HomeBelowMarket rows={home.below} currency={currency} asOf={home.stats.asOf} />
          <HomeGuides guides={guides} />

          <EbaySearchPanel
            heading="Search Pokémon sealed on eBay"
            sub="eBay searches of your own eBay site. They show every listing there, not a price we have checked."
            links={ebayLinks}
            country={country}
            pageType="pokemon_hub"
            className="mb-8"
          />

          <section className="card-surface mb-8 space-y-3 p-6 text-sm leading-relaxed text-slate-300">
            <h2 className="text-lg font-extrabold text-white">How these prices work</h2>
            <p>
              Every product here is one TCGplayer catalogue entry, so an Elite Trainer Box is one product whichever shop sells
              it. For each one we show the cheapest open listing we track in your market, where we track one, ranked by item
              price with postage extra, and TCGplayer&apos;s market price underneath as a reference. Outside the United States that reference is
              converted with an approximate exchange rate and marked with ≈.
            </p>
            <p>
              The price per pack divides that cheapest listing by the booster packs inside, counted from the product&apos;s
              published contents or, for a few plain shapes, from its name. Pre-orders show their price but are never ranked.{" "}
              <Link href="/pokemon/price-per-pack" className="text-brand-400 hover:underline">
                The full ranking
              </Link>{" "}
              explains what is left out.
            </p>
            <p>
              {ebayTracked
                ? "An eBay listing only counts when its title names the product, the right box type and no other set, and its price is plausible against the market price; lots, empty boxes, graded items and other languages are left out. "
                : ""}
              Every product also links to a search of your own eBay site, so you can see everything listed there.
            </p>
            <p>
              RiftCompare is built and run by one person;{" "}
              <Link href="/about" className="text-brand-400 hover:underline">
                the about page
              </Link>{" "}
              says who. The section is new and still a beta: if a price looks wrong, the{" "}
              <Link href="/contact" className="text-brand-400 hover:underline">
                contact page
              </Link>{" "}
              reaches that person.
            </p>
          </section>

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

          <AffiliateDisclosure partner="both" className="text-center" />
        </>
      )}
    </div>
  );
}
