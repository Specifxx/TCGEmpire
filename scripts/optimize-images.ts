#!/usr/bin/env tsx
/**
 * Build-time image optimiser for everything under public/.
 *
 * WHY: the SEO audit's single largest bucket of issues (45 of them, all on the
 * homepage alone) was "large image" — every served image must be under 150 KB.
 * The worst offenders were the re-hosted Signature card photos
 * (public/signature-cards/*.jpg, up to 197 KB) and the Vendetta marketing
 * illustrations (up to 179 KB). Fixing those files once is not enough: the next
 * person to drop a 400 KB screenshot into public/ reintroduces the whole bucket.
 * So this runs as part of `npm run build`, ahead of `next build`.
 *
 * WHAT IT DOES, per raster file under public/:
 *   1. downscales it to the maximum width it is ever DISPLAYED at (see LIMITS),
 *   2. re-encodes it, stepping quality down until the result is under the budget,
 *   3. writes sibling .webp and .avif renditions (each kept only when it is
 *      genuinely smaller than what it would replace),
 *   4. writes narrower WebP renditions for a responsive srcset,
 *   5. records width/height/bytes for all of them in public/image-manifest.json.
 *
 * IDEMPOTENT BY DESIGN. Lossy re-encoding is destructive, so a naive "optimise
 * everything on every build" would visibly degrade the same JPEG a little more on
 * every deploy. The manifest records the source's size+mtime; a file that is
 * already recorded and unchanged is skipped entirely. Delete public/image-manifest.json
 * to force a full re-run (and expect one generation of quality loss if you do).
 *
 * DEGRADES, NEVER BLOCKS. If sharp isn't installed the script warns and exits 0 —
 * `next build` must still run. Enforcement is scripts/check-images.ts's job, and
 * that one DOES fail the build.
 *
 * The manifest is consumed by src/lib/image-manifest.ts, which is how <picture>
 * elements across the site know a .webp exists and what the intrinsic dimensions
 * are (explicit width/height = no cumulative layout shift).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MAX_BYTES, TARGET_BYTES } from "./image-budget";

/** sharp's callable default export (the module namespace itself isn't callable). */
type SharpFn = typeof import("sharp").default;

const PUBLIC_DIR = path.join(process.cwd(), "public");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "image-manifest.json");

/**
 * Maximum width each family of images is ever rendered at, doubled for 2x
 * displays. Downscaling is worth far more than any encoder setting: the sealed
 * product renders are 1200x1200 PNGs shown in a 160px tile.
 */
const LIMITS: { match: RegExp; maxWidth: number }[] = [
  // Card art (portrait ~5:7) renders at most at the card-page hero size (~420px).
  { match: /^signature-cards\//, maxWidth: 900 },
  { match: /^nexus-night-promos\//, maxWidth: 900 },
  // Sealed product tiles render at ~200px in a grid, ~400px in the quick view.
  { match: /^sealed\//, maxWidth: 800 },
  // Full-bleed article/marketing illustrations inside a max-w-3xl (768px) column.
  { match: /^vendetta-/, maxWidth: 1536 },
  { match: /^blog\//, maxWidth: 1600 },
  // PWA icon + logos are already small and are used at their intrinsic size.
  { match: /^icon-|^logo-|^apple-/, maxWidth: 1024 },
];

const SKIP = new Set(["image-manifest.json"]);

/** Widths emitted as extra WebP renditions for a responsive srcset. */
const RESPONSIVE_WIDTHS = [480, 768, 1200];

export interface ManifestEntry {
  /** Site-absolute path of the optimised original, e.g. "/signature-cards/zed…jpg". */
  src: string;
  width: number;
  height: number;
  bytes: number;
  /** Site-absolute path of the WebP sibling, or null when one couldn't be made. */
  webp: string | null;
  webpBytes: number | null;
  /** Site-absolute path of the AVIF sibling — smaller again where it wins. */
  avif: string | null;
  avifBytes: number | null;
  /**
   * Narrower WebP renditions for a responsive srcset, e.g.
   * [{ w: 480, src: "/vendetta-hero-480w.webp" }]. Empty when the image is
   * already small enough that variants would only add requests.
   */
  variants: { w: number; src: string }[];
  /** Fingerprint of the SOURCE file after optimisation — the skip check. */
  fingerprint: string;
}

export type Manifest = Record<string, ManifestEntry>;

const RASTER = /\.(png|jpe?g)$/i;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return [full];
  });
}

function fingerprintOf(file: string): string {
  const buf = fs.readFileSync(file);
  return createHash("sha1").update(buf).digest("hex").slice(0, 16);
}

function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function maxWidthFor(rel: string): number {
  return LIMITS.find((l) => l.match.test(rel))?.maxWidth ?? 1600;
}

/** Remove a .webp sibling we've decided not to ship (bigger than the original). */
function dropWebp(siteAbs: string) {
  const abs = path.join(PUBLIC_DIR, siteAbs.slice(1));
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

/**
 * Narrower WebP renditions for a responsive srcset. A 1536px article
 * illustration served to a 390px phone is ~15x more pixels than the screen can
 * show; a srcset lets the browser pick. Only worth it above ~800px, and only for
 * widths genuinely narrower than the source.
 *
 * Derived from the file ON DISK, so it is safe to call on an image that was
 * skipped as already-optimised — it never re-encodes the original.
 */
/**
 * AVIF sibling. Typically another 15-30% under WebP; <picture> lists it first, so
 * a supporting browser takes it and everything else falls through to WebP and
 * then to the optimised original. Returns its byte size, or null when AVIF didn't
 * win (or this sharp build can't encode it).
 *
 * Reads the file ON DISK, so it is safe to call for an already-optimised image
 * without re-encoding the original.
 */
async function makeAvif(
  sharpFn: SharpFn,
  file: string,
  rel: string,
  webpBytes: number | null
): Promise<number | null> {
  const avifRel = rel.replace(/\.(png|jpe?g)$/i, ".avif");
  const avifAbs = path.join(PUBLIC_DIR, avifRel);
  const ceiling = webpBytes ?? fs.statSync(file).size;
  try {
    if (fs.existsSync(avifAbs)) {
      const existing = fs.statSync(avifAbs).size;
      if (existing < ceiling) return existing;
      dropWebp(`/${avifRel}`);
      return null;
    }
    const buf = await sharpFn(file, { failOn: "none" }).rotate().avif({ quality: 58, effort: 4 }).toBuffer();
    if (buf.length >= ceiling) return null;
    fs.mkdirSync(path.dirname(avifAbs), { recursive: true });
    fs.writeFileSync(avifAbs, buf);
    return buf.length;
  } catch {
    /* AVIF encoding unavailable in this sharp build — WebP still ships */
    return null;
  }
}

async function makeVariants(
  sharpFn: SharpFn,
  file: string,
  rel: string,
  intrinsicWidth: number,
  hasWebp: boolean
): Promise<{ w: number; src: string }[]> {
  const variants: { w: number; src: string }[] = [];
  if (!hasWebp || intrinsicWidth <= 800) return variants;
  for (const w of RESPONSIVE_WIDTHS) {
    if (w >= intrinsicWidth) continue;
    const vRel = rel.replace(/\.(png|jpe?g)$/i, `-${w}w.webp`);
    const vAbs = path.join(PUBLIC_DIR, vRel);
    try {
      if (!fs.existsSync(vAbs)) {
        const buf = await sharpFn(file, { failOn: "none" })
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: 78, effort: 5 })
          .toBuffer();
        fs.mkdirSync(path.dirname(vAbs), { recursive: true });
        fs.writeFileSync(vAbs, buf);
      }
      variants.push({ w, src: `/${vRel}` });
    } catch {
      /* skip this width */
    }
  }
  return variants;
}

async function main() {
  let sharp: SharpFn;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn(
      "[optimize-images] sharp is not installed — skipping optimisation. " +
        "Run `npm i -D sharp` to enable it. (scripts/check-images.ts still enforces the size budget.)"
    );
    return;
  }

  const manifest = readManifest();
  const files = walk(PUBLIC_DIR)
    .filter((f) => RASTER.test(f))
    .filter((f) => !SKIP.has(path.basename(f)))
    // .webp siblings are OUTPUTS of this script, never inputs.
    .sort();

  let optimised = 0;
  let skipped = 0;
  let savedBytes = 0;

  for (const file of files) {
    const rel = path.relative(PUBLIC_DIR, file).split(path.sep).join("/");
    const src = `/${rel}`;
    const before = fs.statSync(file).size;
    const fp = fingerprintOf(file);

    const prev = manifest[src];
    if (prev && prev.fingerprint === fp && before <= MAX_BYTES) {
      // Already optimised by a previous run and untouched since. Re-encoding it
      // would only lose quality, so re-verify the .webp and move on.
      if (prev.webp && prev.webpBytes != null && prev.webpBytes >= prev.bytes) {
        // A WebP that is BIGGER than the optimised original is worse than useless:
        // <picture> would pick it and ship more bytes. Common for small flat-colour
        // PNG logos, where PNG's palette encoding beats WebP outright.
        dropWebp(prev.webp);
        prev.webp = null;
        prev.webpBytes = null;
      }
      if (!prev.webp || fs.existsSync(path.join(PUBLIC_DIR, prev.webp.slice(1)))) {
        // Responsive renditions are derived from the (unchanged) optimised file,
        // so they can be topped up without re-encoding — and therefore without
        // another generation of lossy degradation.
        prev.variants = await makeVariants(sharp, file, rel, prev.width, prev.webp != null);
        prev.avif = null;
        prev.avifBytes = await makeAvif(sharp, file, rel, prev.webpBytes);
        if (prev.avifBytes != null) prev.avif = rel.replace(/\.(png|jpe?g)$/i, ".avif").replace(/^/, "/");
        skipped++;
        continue;
      }
    }

    const isPng = /\.png$/i.test(file);
    const meta = await sharp(file).metadata();
    const maxW = maxWidthFor(rel);
    const needsResize = (meta.width ?? 0) > maxW;

    const base = () => {
      let p = sharp(file, { failOn: "none" }).rotate();
      if (needsResize) p = p.resize({ width: maxW, withoutEnlargement: true });
      return p;
    };

    // Step quality down until the encode fits the target. PNG photographs are
    // re-encoded as PNG (they may carry alpha the site relies on) but with
    // palette quantisation, which is where the real saving is for flat art.
    let out: Buffer | undefined;
    for (const q of [86, 80, 74, 68, 62, 56, 50]) {
      out = isPng
        ? await base().png({ compressionLevel: 9, palette: true, quality: q, effort: 10 }).toBuffer()
        : await base().jpeg({ quality: q, mozjpeg: true, progressive: true }).toBuffer();
      if (out.length <= TARGET_BYTES) break;
    }
    if (!out) continue;

    // Never make a file bigger than it already was: if the source was already
    // small and well-encoded, keep it byte-for-byte.
    if (out.length < before) {
      fs.writeFileSync(file, out);
      savedBytes += before - out.length;
    }

    const finalMeta = await sharp(file).metadata();

    // WebP sibling. Same budget ladder; WebP virtually always wins comfortably.
    const webpRel = rel.replace(/\.(png|jpe?g)$/i, ".webp");
    const webpAbs = path.join(PUBLIC_DIR, webpRel);
    let webpBytes: number | null = null;
    try {
      let webpBuf: Buffer | undefined;
      for (const q of [82, 76, 70, 64, 58]) {
        webpBuf = await base().webp({ quality: q, effort: 5 }).toBuffer();
        if (webpBuf.length <= TARGET_BYTES) break;
      }
      // Only keep the WebP if it actually beats the optimised original — see the
      // note in the skip branch above.
      if (webpBuf && webpBuf.length < fs.statSync(file).size) {
        fs.mkdirSync(path.dirname(webpAbs), { recursive: true });
        fs.writeFileSync(webpAbs, webpBuf);
        webpBytes = webpBuf.length;
      } else {
        dropWebp(`/${webpRel}`);
      }
    } catch {
      /* a format sharp can't re-encode — the optimised original still ships */
    }

    const avifRel = rel.replace(/\.(png|jpe?g)$/i, ".avif");
    const avifBytes = await makeAvif(sharp, file, rel, webpBytes);

    const variants = await makeVariants(sharp, file, rel, finalMeta.width ?? 0, webpBytes != null);

    manifest[src] = {
      src,
      width: finalMeta.width ?? 0,
      height: finalMeta.height ?? 0,
      bytes: fs.statSync(file).size,
      webp: webpBytes != null ? `/${webpRel}` : null,
      webpBytes,
      avif: avifBytes != null ? `/${avifRel}` : null,
      avifBytes,
      variants,
      fingerprint: fingerprintOf(file),
    };
    optimised++;
    const kb = (n: number) => `${Math.round(n / 1024)}KB`;
    console.log(
      `[optimize-images] ${src}: ${kb(before)} → ${kb(manifest[src].bytes)}` +
        (webpBytes ? ` (webp ${kb(webpBytes)})` : "") +
        (avifBytes ? ` (avif ${kb(avifBytes)})` : "") +
        (needsResize ? ` [resized to ${maxW}px]` : "")
    );
  }

  // Drop manifest entries whose source file no longer exists, so a deleted image
  // can't leave a dangling <picture> source behind — and delete the .webp
  // derivatives it owned, so they don't linger in the deploy as dead weight.
  for (const [key, entry] of Object.entries(manifest)) {
    if (fs.existsSync(path.join(PUBLIC_DIR, key.slice(1)))) continue;
    if (entry.webp) dropWebp(entry.webp);
    if (entry.avif) dropWebp(entry.avif);
    for (const v of entry.variants ?? []) dropWebp(v.src);
    delete manifest[key];
  }

  fs.writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify(
      Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : 1))),
      null,
      2
    )}\n`
  );
  console.log(
    `[optimize-images] ${optimised} optimised, ${skipped} already current, ${Math.round(
      savedBytes / 1024
    )}KB saved. Manifest: public/image-manifest.json`
  );
}

main().catch((err) => {
  // Optimisation is best-effort — enforcement lives in check-images.ts.
  console.warn("[optimize-images] failed (continuing):", err?.message ?? err);
});
