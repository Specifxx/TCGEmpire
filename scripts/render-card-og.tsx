/**
 * Render the /card share image from fixtures and write PNGs, so the layout can
 * be LOOKED AT without a database or a deploy (the scripts/render-hot40-og.tsx
 * pattern).
 *
 *   npx tsx scripts/render-card-og.tsx [out.png]
 *
 * Three fixtures: every market priced with long figures (the chip row's worst
 * case beside the 330px art), a card with no US price (the headline falls back
 * to EU), and a card with no price at all.
 */
import React from "react";
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { CardOgImage, CARD_OG_SIZE } from "../src/lib/card-og";
import { cardImageForOg } from "../src/lib/card-image-url";
import { ogPriceLines, type OgPriceCard } from "../src/lib/og-price";

const art = cardImageForOg({
  imageUrl: null,
  imageThumbUrl: "https://cdn.riftscribe.gg/cards/thumbnails/large/ogn-001-298-8de89b4b8fb3186d.webp",
});

const fixtures: { suffix: string; name: string; card: OgPriceCard }[] = [
  {
    suffix: "",
    name: "Kennen, Storm of Shuriken",
    card: {
      lowestPriceCentsUs: 123456, lowestPriceCents: 189999, lowestPriceCentsUk: 98765,
      lowestPriceCentsSg: 165432, lowestPriceCentsCa: 171234, lowestPriceCentsEu: 112345,
    },
  },
  {
    suffix: "-no-us",
    name: "Astral Heron",
    card: {
      lowestPriceCentsUs: null, lowestPriceCents: 5200, lowestPriceCentsUk: null,
      lowestPriceCentsSg: null, lowestPriceCentsCa: 4700, lowestPriceCentsEu: 3150,
    },
  },
  {
    suffix: "-unpriced",
    name: "Shen, Eye of Twilight",
    card: {
      lowestPriceCentsUs: null, lowestPriceCents: null, lowestPriceCentsUk: null,
      lowestPriceCentsSg: null, lowestPriceCentsCa: null, lowestPriceCentsEu: null,
    },
  },
];

async function main() {
  const out = process.argv[2] ?? "card-og.png";
  for (const f of fixtures) {
    const { headline, others } = ogPriceLines(f.card);
    const res = new ImageResponse(
      <CardOgImage name={f.name} setLine="OGN · 001/298" headline={headline} others={others} art={art} />,
      CARD_OG_SIZE
    );
    const path = out.replace(/\.png$/, `${f.suffix}.png`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    console.log(`wrote ${path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
