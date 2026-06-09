// Precompute a perceptual dHash for every card from its `blurDataUrl` (a tiny
// base64 image already stored in the DB) so the camera scanner can visually match a
// photographed card. Runs in the production build; fetch-free (no image CDN), fast,
// incremental (only cards missing a hash) and non-fatal.
import { PrismaClient } from "@prisma/client";
import { Jimp, intToRGBA } from "jimp";
import { DHASH_W, DHASH_H, dHashFromGray, luma } from "../src/lib/image-hash";

const prisma = new PrismaClient();

async function hashBlur(dataUrl: string): Promise<string | null> {
  try {
    const b64 = dataUrl.split(",")[1];
    if (!b64) return null;
    const img = await Jimp.read(Buffer.from(b64, "base64"));
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
    where: { imageHash: null, blurDataUrl: { not: null } },
    select: { id: true, blurDataUrl: true },
  });
  if (!cards.length) {
    console.log("Card hashes: nothing to do.");
    return;
  }
  console.log(`Card hashes: computing for ${cards.length} card(s) from blur placeholders…`);
  let done = 0;
  for (const c of cards) {
    const hash = c.blurDataUrl ? await hashBlur(c.blurDataUrl) : null;
    if (!hash) continue;
    await prisma.card.update({ where: { id: c.id }, data: { imageHash: hash } }).catch(() => {});
    done++;
  }
  console.log(`Card hashes: stored ${done}/${cards.length}.`);
}

main()
  .catch((e) => console.error("Card hash precompute failed (non-fatal):", e?.message ?? e))
  .finally(() => prisma.$disconnect());
