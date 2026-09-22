/**
 * Render the Hot 40 share image from a fixture and write it to a PNG, so the
 * layout can be LOOKED AT without a database, a deploy, or a minted snapshot.
 *
 *   npx tsx scripts/render-hot40-og.tsx [out.png]
 *
 * This exists because the first version of this image shipped unverified: the
 * only way to see it was to mint a real snapshot in production, which needs
 * admin. Drawing it from a fixture catches the things that only show up
 * visually — a name overflowing its box, a delta chip wrapping, satori
 * silently dropping a node.
 */
import React from "react";
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { Hot40Image, HOT40_SIZE } from "../src/lib/hot40-og";
import type { RisingSnapshotPick } from "../src/lib/rising-snapshot";

const pick = (over: Partial<RisingSnapshotPick>): RisingSnapshotPick => ({
  id: "c", slug: "c", displayName: "Card", setCode: "VEN", collectorNumber: "044/166",
  imageThumbUrl: null, score: 90, priceCents: 1299, currency: "AUD",
  trend7: 0, trend30: 0, posPct: 0.5, listings: 7, spark: [1, 2], confidence: "High" as never,
  ...over,
});

// Deliberately awkward: a long name at #1, a negative mover at #3, and real
// mirrored art so the image fetches what production would.
// Real RiftScribe thumbnail URLs, exactly the shape the database stores, so
// the render exercises cardImageForOg's rewrite rather than a hand-made URL.
const thumb = (stem: string) => `https://cdn.riftscribe.gg/cards/thumbnails/large/${stem}.webp`;
const picks: RisingSnapshotPick[] = [
  pick({ id: "1", displayName: "Kennen, Storm of Shuriken", trend7: 18.4, trend30: 26.1, priceCents: 3499,
    imageThumbUrl: thumb("ogn-001-298-8de89b4b8fb3186d") }),
  pick({ id: "2", displayName: "Astral Heron", trend7: 6.2, trend30: 11.0, priceCents: 3400,
    imageThumbUrl: thumb("ogn-002-298-d05bc20f4ee5deae") }),
  pick({ id: "3", displayName: "Shen, Eye of Twilight", trend7: -1.4, trend30: 3.2, priceCents: 8999,
    imageThumbUrl: thumb("ogn-003-298-921247619577ca06") }),
  pick({ id: "4", displayName: "Never drawn", trend7: 99 }),
];

async function main() {
  const out = process.argv[2] ?? "hot40-og.png";
  const res = new ImageResponse(<Hot40Image picks={picks} dateLabel="22 September 2026" />, HOT40_SIZE);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${out}`);

  const empty = new ImageResponse(<Hot40Image picks={[]} dateLabel={null} />, HOT40_SIZE);
  const fallback = out.replace(/\.png$/, "-fallback.png");
  writeFileSync(fallback, Buffer.from(await empty.arrayBuffer()));
  console.log(`wrote ${fallback}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
