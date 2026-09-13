#!/usr/bin/env tsx
/**
 * Mirrors every card's art into public/card-art/ so the site stops depending on a
 * third party's CDN staying up.
 *
 * WHY. On 2026-09-13 the RiftScribe CDN deleted its `cards/originals/` tree and
 * card images broke across the whole site (DECISIONS.md, "Card art: the CDN
 * dropped `originals/`"). The immediate fix rewrote our URLs onto the rendition
 * that still answered — which works, and leaves us exactly as exposed to the
 * next deletion. `riftscribe.gg` itself now 404s, so there will probably be a
 * next deletion. This script is the answer: one copy of every card, served from
 * our own origin, with no runtime dependency on anyone else.
 *
 * WHAT IT WRITES. One file per card, `public/card-art/<stem>.webp`, where <stem> is
 * the CDN's own filename stem (`ogn-029-298-723927dee729ccc5`). Keeping their
 * stem is what lets lib/card-image-url.ts map a stored URL onto our copy with
 * pure string work — no lookup table, so the helper stays safe to import from
 * client components.
 *
 * SOURCE RENDITION. `thumbnails/large` (744x1039), the largest one the CDN still
 * serves and larger than any slot this site renders a card in, hero included.
 *
 * SIZE BUDGET. Anything over TARGET_BYTES is re-encoded with sharp, quality
 * stepping down until it fits — scripts/check-images.ts FAILS THE BUILD on any
 * file in public/ over MAX_BYTES, and roughly one card in eight arrives above
 * it. Everything else is written byte-for-byte as served: re-encoding an image
 * that already fits would only throw away quality. (optimize-images.ts ignores
 * these files entirely — its RASTER pattern is png/jpe?g — so there is no
 * build-time cost here and no second generation of lossy encoding.)
 *
 * RESUMABLE, AND SERIAL-ISH ON PURPOSE. An existing file is skipped, so a run
 * that dies half way costs nothing to repeat. Downloads run at CONCURRENCY 4
 * with retries: this CDN (or the proxy in front of it) starts returning
 * spurious 404s when hammered, and a "missing" card that is really just rate
 * limiting must never be written off as absent.
 *
 *   npx tsx scripts/mirror-card-art.ts [--concurrency N] [--force]
 *
 * ART THAT NO LONGER EXISTS. 71 of the 950 catalogued cards (measured
 * 2026-09-13) 404 at every rendition the CDN offers — their art is simply gone,
 * not rate limited: the same URLs 404 on five serial retries. Those stems are
 * recorded in src/lib/card-art-missing.ts, which this script REGENERATES on
 * every complete run, and cardImageSrc returns null for them so CardImage falls
 * back to its generated CardArt instead of emitting a broken <img>. The list is
 * only rewritten when the failure rate looks like missing files rather than a
 * broken network (see MAX_MISSING_SHARE) — a run with the CDN unreachable must
 * never blank out the catalogue.
 *
 * Coverage is enforced by tests/card-image-url.test.ts: every card in
 * prisma/riftbound-cards.json must either have a file here or be listed as
 * missing, because the URL rewrite is unconditional. Refresh the dataset
 * (scripts/fetch-cards.ts) and this must be re-run in the same change, or that
 * test fails — which is the point.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { MAX_BYTES, TARGET_BYTES } from "./image-budget";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public/card-art");
const DATASET = path.join(ROOT, "prisma/riftbound-cards.json");
const MISSING_MODULE = path.join(ROOT, "src/lib/card-art-missing.ts");

/**
 * Above this share of the catalogue, a run's failures are read as "the network
 * is broken", not "the art is gone", and the missing list is left untouched.
 */
const MAX_MISSING_SHARE = 0.15;

interface DatasetCard {
  id: string;
  image?: string;
  image_thumb?: { small?: string; medium?: string; large?: string };
}

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const CONCURRENCY = Math.max(1, Number(args[args.indexOf("--concurrency") + 1]) || 4);

/** The CDN's filename stem, which is also our filename. */
function stemOf(url: string): string | null {
  const file = url.split("/").pop();
  if (!file) return null;
  const stem = file.replace(/\.[a-z0-9]+$/i, "");
  return /^[a-z0-9][a-z0-9-]*$/i.test(stem) ? stem : null;
}

/**
 * curl, not fetch. Measured on this CDN: node's fetch returns a spurious 404 for
 * a file that `curl` fetches successfully on the same machine, seconds apart,
 * and it does so often enough to write off a third of the catalogue as missing.
 * A wrong 404 here is not a slow run, it is a card silently dropped from the
 * mirror, so the client that demonstrably tells the truth is the one to use.
 * `--fail` makes curl exit non-zero on any HTTP error, so a 404 body is never
 * mistaken for an image.
 */
const run = promisify(execFile);

async function curlOnce(url: string): Promise<Buffer | null> {
  try {
    const { stdout } = await run("curl", ["-sS", "--fail", "--max-time", "30", url], {
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function download(url: string, attempts = 4): Promise<Buffer | null> {
  for (let i = 0; i < attempts; i++) {
    const buf = await curlOnce(url);
    if (buf && buf.length > 0) return buf;
    // A 404 under load can still be rate limiting, so it is retried like any
    // other failure and only believed after the last attempt.
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  return null;
}

/** Re-encode down to the budget. Returns the original when sharp is unavailable. */
async function fit(buf: Buffer, label: string): Promise<Buffer> {
  if (buf.length <= TARGET_BYTES) return buf;
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn(`[mirror-card-art] sharp not installed — ${label} stays ${Math.round(buf.length / 1024)}KB`);
    return buf;
  }
  for (const quality of [82, 74, 66, 58, 50]) {
    const out = await sharp(buf).webp({ quality }).toBuffer();
    if (out.length <= TARGET_BYTES) return out;
  }
  // Last resort: narrow it. 600px still covers the ~420px hero on a 2x display.
  return sharp(buf).resize({ width: 600, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
}

async function main() {
  const cards: DatasetCard[] = JSON.parse(fs.readFileSync(DATASET, "utf8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const jobs = cards
    .map((c) => {
      const url = c.image_thumb?.large ?? c.image_thumb?.small ?? c.image;
      const stem = url ? stemOf(url) : null;
      return url && stem ? { id: c.id, url, stem } : null;
    })
    .filter((j): j is { id: string; url: string; stem: string } => j !== null);

  if (jobs.length !== cards.length) {
    console.warn(`[mirror-card-art] ${cards.length - jobs.length} dataset rows have no usable art URL`);
  }

  let written = 0;
  let skipped = 0;
  let reencoded = 0;
  const failed: { id: string; url: string; stem: string }[] = [];
  let next = 0;

  async function worker() {
    for (;;) {
      const job = jobs[next++];
      if (!job) return;
      const dest = path.join(OUT_DIR, `${job.stem}.webp`);
      if (!FORCE && fs.existsSync(dest)) {
        skipped++;
        continue;
      }
      const buf = await download(job.url);
      if (!buf) {
        failed.push(job);
        continue;
      }
      const out = await fit(buf, job.id);
      if (out.length !== buf.length) reencoded++;
      fs.writeFileSync(dest, out);
      written++;
      if ((written + skipped) % 50 === 0) {
        process.stdout.write(`  ${written + skipped}/${jobs.length}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".webp"));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(OUT_DIR, f)).size, 0);
  const over = files.filter((f) => fs.statSync(path.join(OUT_DIR, f)).size > MAX_BYTES);

  console.log(
    `[mirror-card-art] ${written} written, ${skipped} already present, ${reencoded} re-encoded to fit the budget, ` +
      `${failed.length} unavailable — ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB total`
  );
  if (over.length) console.error(`[mirror-card-art] OVER BUDGET (check-images.ts will fail): ${over.join(", ")}`);

  const share = failed.length / Math.max(1, jobs.length);
  if (share > MAX_MISSING_SHARE) {
    console.error(
      `[mirror-card-art] ${failed.length} of ${jobs.length} cards failed (${Math.round(share * 100)}%) — that reads as a ` +
        `broken connection, not missing art, so src/lib/card-art-missing.ts was left alone. Re-run when the network is well.`
    );
    for (const f of failed.slice(0, 10)) console.error(`    ${f.id} (${f.url})`);
    process.exit(1);
  }

  writeMissingModule(failed);
  console.log(
    failed.length
      ? `[mirror-card-art] ${failed.length} cards have no art on the CDN at any rendition — recorded in ` +
          `src/lib/card-art-missing.ts, where they render as generated CardArt instead of a broken image.`
      : `[mirror-card-art] every catalogued card is mirrored.`
  );
  if (over.length) process.exit(1);
}

/** Regenerates the list of cards whose art the CDN no longer has, at any size. */
function writeMissingModule(failed: { id: string; stem: string }[]) {
  const stems = [...new Set(failed.map((f) => f.stem))].sort();
  const body = `// GENERATED by scripts/mirror-card-art.ts — do not edit by hand.
//
// Cards whose art the RiftScribe CDN no longer serves at ANY rendition, so
// there is nothing for public/card-art/ to mirror. lib/card-image-url.ts
// returns null for these, which makes CardImage fall back to its generated
// CardArt instead of emitting an <img> that 404s.
//
// This ships in the client bundle (CardImage is pulled in by QuickView and
// SellForm), which is the whole reason the main URL rewrite is a pure string
// function with no lookup table: a short exception list costs a couple of KB,
// a full 950-entry table would not be worth it. tests/card-image-url.test.ts
// caps how long this may get.
//
// Re-run the mirror to refresh it: npx tsx scripts/mirror-card-art.ts
export const MISSING_CARD_ART: ReadonlySet<string> = new Set([
${stems.map((x) => `  "${x}",`).join("\n")}
]);
`;
  fs.writeFileSync(MISSING_MODULE, body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
