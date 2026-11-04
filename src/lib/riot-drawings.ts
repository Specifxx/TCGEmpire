// Riot's drawing-only Riftbound products of late 2026 (owner, 2026-11-04:
// "Riftcompare needs more items … the K/DA couture collection as well as the
// new Worlds 2026 bundle … featured on the front page close to the top").
//
// Neither is sold through a store we track: like the T1 2025 Worlds Champion
// Collection before them (lib/sealed-import.ts, T1_COLLECTION), both are sold
// by the Riot Games Merch Store through a free registration drawing, so the only
// prices RiftCompare will ever see for them are resale. The sealed importer seeds
// an eBay search for each (RIOT_DRAWING_SEEDS) and names and pictures the group
// from here, so the tile never shows a reseller's title or photo.
//
// EVERY FACT HERE IS RIOT'S OWN, from "Riftbound's 2026 Drawings"
// (playriftbound.com, 2026-10-21, updated for the November dates): the price,
// the contents, the languages and the dates. The images are Riot's own product
// renders from that announcement, on Riot's CDN (cmsassets.rgpub.io, already
// the host of every card image since Vendetta), used as product pictures only.
// Pure and client-safe: no imports, no dates computed, so the homepage row and
// the importer read the same list.

export interface RiotDrawing {
  /** The sealed group key the importer files resale rows under (lib/sealed-import.ts). */
  groupKey: string;
  /** classifySealed()'s product type for this product. */
  productType: string;
  /** The product's name as Riot publishes it. */
  name: string;
  /** Short line under the name on the homepage row. */
  tagline: string;
  /** Riot's published price, US dollars, plus shipping and handling. */
  priceUsd: number;
  /** ISO dates of the Riot Merch Store drawing: registration opens, closes, first selection emails. */
  drawing: { opens: string; closes: string; emails: string };
  /** Where it is also sold in person, in Riot's words. */
  inPerson: string;
  /** Riot's product render, used as the tile and card image. */
  imageUrl: string;
  imageAlt: string;
  /** Our write-up. */
  blogSlug: string;
  /** Riot's own announcement, for the "how to enter" link. */
  riotUrl: string;
  /** What is in the box, in Riot's words. */
  contents: string[];
}

export const RIOT_DRAWINGS_URL = "https://playriftbound.com/en-us/news/announcements/riftbounds-2026-drawings/";

export const RIOT_DRAWINGS: RiotDrawing[] = [
  {
    groupKey: "KDA|K/DA Couture Collection|EN",
    productType: "K/DA Couture Collection",
    name: "Riftbound x K/DA: Couture Collection",
    tagline: "Four K/DA Legends and the Packed Amphitheater battlefield, with new Fortiche art, in a US$150 box.",
    priceUsd: 150,
    drawing: { opens: "2026-10-27", closes: "2026-10-30", emails: "2026-11-03" },
    inPerson: "Convergence Fest, Las Vegas, 11–13 December 2026",
    imageUrl: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/ddcf8b5b7b587cf960ef53d5420928b856884c5c-2234x1257.jpg",
    imageAlt: "Riftbound x K/DA: Couture Collection — Riot's product render of the box, the four K/DA Legend cards, the playmat, deck box, sleeves and metal dice",
    blogSlug: "riftbound-kda-couture-collection-worlds-2026-edition",
    riotUrl: RIOT_DRAWINGS_URL,
    contents: [
      "4 collectible Legend cards with new K/DA artwork: Agony's Embrace (Evelynn), Nine-Tailed Fox (Ahri), Rogue Assassin (Akali) and Daughter of the Void (Kai'Sa)",
      "1 collectible Battlefield card: Packed Amphitheater",
      "1 K/DA limited-edition playmat",
      "1 K/DA limited-edition deck box",
      "1 pack of K/DA limited-edition card sleeves (75)",
      "4 K/DA limited-edition D12 metal dice",
      "1 FIRESTARTER KiT keychain and user manual, which connects to a phone to play K/DA's newest single and its video",
    ],
  },
  {
    groupKey: "W26|Worlds 2026 Edition|EN",
    productType: "Worlds 2026 Edition",
    name: "Riftbound x Worlds 2026 Edition",
    tagline: "A Worlds-exclusive Yasuo Legend promo, three host-city Battlefields, a deck box and foil sleeves for US$80.",
    priceUsd: 80,
    drawing: { opens: "2026-11-13", closes: "2026-11-16", emails: "2026-11-17" },
    inPerson: "Worlds Quarterfinals and Semifinals (Allen, Texas) and Worlds Fan Fest (New York City), November 2026",
    imageUrl: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/news_live/c81340b874ad8ff22fe2d23481479649e8e09db3-2560x1440.jpg",
    imageAlt: "Riftbound x Worlds 2026 Edition — Riot's product render of the Yasuo Legend promo, the three host-city Battlefield cards, the Worlds 2026 deck box and foil sleeves",
    blogSlug: "riftbound-kda-couture-collection-worlds-2026-edition",
    riotUrl: RIOT_DRAWINGS_URL,
    contents: [
      "1 Legend promo card, Unforgiven (Yasuo), with new art exclusive to Worlds",
      "3 Battlefield promo cards with art of each Worlds 2026 host city: Los Angeles, Allen and New York City",
      "1 Worlds 2026 deck box",
      "1 pack of Worlds 2026 foil card sleeves",
      "Online orders also get the Worlds Unvaulted Capsule 2026, an in-game League of Legends item (not included at the venues)",
    ],
  },
];

/** Where the drawing for a product stands on a given day, in words a visitor can act on. */
export function drawingStatus(d: RiotDrawing, today: string): "upcoming" | "open" | "closed" {
  if (today < d.drawing.opens) return "upcoming";
  if (today <= d.drawing.closes) return "open";
  return "closed";
}

/** "13–16 November 2026", from the drawing's ISO dates (same month and year assumed, as Riot's windows are). */
export function drawingWindow(d: RiotDrawing): string {
  const month = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const day = (iso: string) => String(Number(iso.slice(8, 10)));
  return `${day(d.drawing.opens)}–${day(d.drawing.closes)} ${month(d.drawing.closes)}`;
}
