import type { Metadata } from "next";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog } from "@/lib/pokemon/data";
import { toDisplay } from "@/lib/pokemon/browse";
import { hubTiles, kindHub } from "@/lib/pokemon/hubs";
import { pokemonMeta } from "@/lib/pokemon/seo";
import { KindHubView } from "@/components/pokemon/KindHubView";

// A kind hub (lib/pokemon/hubs.ts KIND_HUBS, components/pokemon/KindHubView).
// Per-request over the market's cached catalogue, like the other grids: one
// getPokemonCatalog read, nothing else. A read error throws (an HTTP 500, never
// cached or noindexed); a catalogue with none of this kind yet is a 200 with
// noindex, follow.
export const dynamic = "force-dynamic";

const HUB = kindHub("booster-boxes");

export async function generateMetadata(): Promise<Metadata> {
  if (!pokemonEnabled()) return notFoundMetadata();
  const catalog = await getPokemonCatalog(getCountry());
  return pokemonMeta({
    title: HUB.title,
    description: HUB.description,
    path: HUB.path,
    ogImage: "section",
    robots: hubTiles(catalog, HUB).length ? undefined : { index: false, follow: true },
  });
}

export default async function BoosterBoxesPage() {
  const country = getCountry();
  const currency = getDisplayCurrency(country);
  const catalog = await getPokemonCatalog(country);
  const shown = { ...catalog, tiles: toDisplay(catalog.tiles, country === "UK" && currency === "EUR") };
  return <KindHubView hub={HUB} catalog={shown} country={country} currency={currency} today={new Date().toISOString().slice(0, 10)} />;
}
