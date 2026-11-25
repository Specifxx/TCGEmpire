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

  // Since 2026-11-20 a snapshot also freezes the week's biggest drops: the split layout.
  const drops = [
    { id: "d1", slug: "d1", displayName: "Jinx, Demolitionist (Overnumbered)", setCode: "OGN", collectorNumber: "301/298", imageThumbUrl: null, nowCents: 4200, refCents: 6100, pct: -31.1, currency: "AUD" },
    { id: "d2", slug: "d2", displayName: "Teemo, Swift Scout", setCode: "OGN", collectorNumber: "005/298", imageThumbUrl: null, nowCents: 899, refCents: 1150, pct: -21.8, currency: "AUD" },
    { id: "d3", slug: "d3", displayName: "Garen, Rugged", setCode: "OGN", collectorNumber: "006/298", imageThumbUrl: null, nowCents: 350, refCents: 420, pct: -16.7, currency: "AUD" },
  ];
  const split = new ImageResponse(<Hot40Image picks={picks} drops={drops} dateLabel="20 November 2026" />, HOT40_SIZE);
  const splitOut = out.replace(/\.png$/, "-drops.png");
  writeFileSync(splitOut, Buffer.from(await split.arrayBuffer()));
  console.log(`wrote ${splitOut}`);

  const empty = new ImageResponse(<Hot40Image picks={[]} dateLabel={null} />, HOT40_SIZE);
  const fallback = out.replace(/\.png$/, "-fallback.png");
  writeFileSync(fallback, Buffer.from(await empty.arrayBuffer()));
  console.log(`wrote ${fallback}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
