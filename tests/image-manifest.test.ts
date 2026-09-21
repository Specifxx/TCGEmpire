import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// public/image-manifest.json is what every <picture> on the site reads to learn
// that a .webp/.avif/srcset rendition of an image exists. Nothing downstream
// verifies those paths still resolve — a manifest entry pointing at a file that
// is not on disk ships 404ing <source> elements, and the browser silently falls
// back to the original. Silently is the problem: the page looks correct in
// review, and the only symptom is that the optimised renditions the whole
// build-time pipeline exists to produce are never actually served.
//
// THE BUG THIS CAUGHT, in scripts/optimize-images.ts's end-of-run cleanup:
// derivative names are the source's basename with the extension swapped, so
// `hero.png` and `hero.jpg` both own `/blog/hero.webp`, `/blog/hero.avif` and
// every `-<w>w.webp`. Re-encoding a hero from PNG to JPEG therefore left a stale
// `.png` manifest entry whose cleanup deleted the derivatives the new `.jpg`
// entry had written three lines earlier in the same run. The cleanup now skips
// any path a surviving entry also claims; this test is the guard, because the
// failure is invisible without one.
// ─────────────────────────────────────────────────────────────────────────────

type Entry = {
  src: string;
  webp: string | null;
  avif: string | null;
  variants?: { src: string }[];
};

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const manifest: Record<string, Entry> = JSON.parse(
  readFileSync(join(PUBLIC, "image-manifest.json"), "utf8"),
);

test("every path the image manifest advertises exists on disk", () => {
  const dangling: string[] = [];
  for (const [key, entry] of Object.entries(manifest)) {
    const paths = [key, entry.webp, entry.avif, ...(entry.variants ?? []).map((v) => v.src)];
    for (const p of paths) {
      if (!p) continue;
      if (!existsSync(join(PUBLIC, p.replace(/^\//, "")))) dangling.push(`${key} → ${p}`);
    }
  }
  assert.deepEqual(
    dangling,
    [],
    `the manifest advertises renditions that are not in public/ — every one of these ships a 404ing <source>:\n  ${dangling.join("\n  ")}`,
  );
});

test("the manifest is not empty and keys are site-absolute", () => {
  const keys = Object.keys(manifest);
  assert.ok(keys.length > 20, `expected a populated manifest, found ${keys.length} entries`);
  const bad = keys.filter((k) => !k.startsWith("/"));
  assert.deepEqual(bad, [], `manifest keys must be site-absolute paths: ${bad.join(", ")}`);
});
