// Precompute a perceptual dHash for every card image so the camera scanner can
// match a photographed card against the database. Runs in the production build
// (after `prisma db push`); it's incremental (only hashes cards missing a hash)
// and non-fatal, so the first deploy backfills everything and later deploys are
// cheap. New cards from a later import get hashed on the next deploy.
//
// Uses the SAME dHash bit-logic as the browser scanner (src/lib/image-hash.ts) so
// a phone capture and the stored card-image hash are directly comparable.
import { PrismaClient } from "@prisma/client";
import { Jimp, intToRGBA } from "jimp";
import { DHASH_W, DHASH_H, dHashFromGray, luma } from "../src/lib/image-hash";

const prisma = new PrismaClient();

// Cap per run so a deploy can't hang indefinitely; plenty for the current set.
const MAX_PER_RUN = Number(process.env.HASH_MAX_PER_RUN ?? 2000);
const CONCURRENCY = 6;

async function hashImage(url: string): Promise<string | null> {
  try {
    const img = await Jimp.read(url);
    img.resize({ w: DHASH_W, h: DHASH_H });
    const gray: number[] = [];
    for (let y = 0; y < DHASH_H; y++) {
      for (let x = 0; x < DHASH_W; x++) {
        const { r, g, b } = intToRGBA(img.getPixelColor(x, y));
        gray.push(luma(r, g, b));
      }
    }
    return dHashFromGray(gray);
  } catch {
    return null;
  }
}

async function main() {
  const cards = await prisma.card.findMany({
    where: {
      imageHash: null,
      OR: [{ imageThumbUrl: { not: null } }, { imageUrl: { not: null } }],
    },
    select: { id: true, imageThumbUrl: true, imageUrl: true },
    take: MAX_PER_RUN,
  });
  if (!cards.length) {
    console.log("Card hashes: nothing to do.");
    return;
  }
  console.log(`Card hashes: computing for ${cards.length} card(s)…`);

  let done = 0;
  let failed = 0;
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const batch = cards.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (c) => {
        const url = c.imageThumbUrl || c.imageUrl;
        if (!url) return;
        const hash = await hashImage(url);
        if (!hash) {
          failed++;
          return;
        }
        await prisma.card.update({ where: { id: c.id }, data: { imageHash: hash } }).catch(() => {});
        done++;
      })
    );
  }
  console.log(`Card hashes: stored ${done}, failed ${failed}.`);
}

main()
  .catch((e) => {
    console.error("Card hash precompute failed (non-fatal):", e?.message ?? e);
  })
  .finally(() => prisma.$disconnect());
