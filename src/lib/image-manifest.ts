// Typed access to public/image-manifest.json, the output of
// scripts/optimize-images.ts (which runs as part of `npm run build`).
//
// It gives every static image under public/ three things the markup needs and
// otherwise has to hard-code (and therefore gets wrong):
//   • intrinsic width/height  → explicit width+height attributes → no layout shift
//   • a .webp sibling         → <picture> can serve a modern format with the
//                               original as the automatic fallback
//   • byte size               → so a build check can enforce the 150 KB budget
//
// Importing JSON keeps this a pure compile-time lookup: no fs at request time, no
// runtime cost, and a missing entry simply means "we know nothing about this
// image", which every consumer treats as "render it plainly".
import manifest from "../../public/image-manifest.json";

export interface OptimisedImage {
  src: string;
  width: number;
  height: number;
  bytes: number;
  webp: string | null;
  webpBytes: number | null;
  avif: string | null;
  avifBytes: number | null;
  /** Narrower WebP renditions for a responsive srcset (empty for small images). */
  variants: { w: number; src: string }[];
  fingerprint: string;
}

const MANIFEST = manifest as Record<string, OptimisedImage>;

/**
 * Look up a static image by its site-absolute path ("/vendetta-hero.png").
 * Also accepts an absolute URL on our own origin, because card `imageUrl`s for
 * the re-hosted Signature prints are stored in the database as
 * "https://riftcompare.com/signature-cards/….jpg" (see prisma/manual-cards.json).
 */
export function optimisedImage(src: string | null | undefined): OptimisedImage | null {
  if (!src) return null;
  let key = src;
  const onOwnOrigin = src.match(/^https?:\/\/(?:www\.)?riftcompare\.com(\/.*)$/i);
  if (onOwnOrigin) key = onOwnOrigin[1];
  if (!key.startsWith("/")) return null;
  // Strip any cache-busting query so a versioned URL still resolves.
  key = key.split("?")[0];
  return MANIFEST[key] ?? null;
}
