import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "src/app");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "page.tsx" || e === "route.ts") out.push(p);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SEGMENT-TTL INVERSION — the single most expensive bug in this repo's
// history, and completely invisible in review.
//
// An `unstable_cache` entry does NOT get a private TTL. Next sets
// `store.revalidate = options.revalidate` unless the store's is already smaller
// (server/web/spec-extension/unstable-cache.js), so the SHORTEST inner TTL
// becomes the TTL of the whole SEGMENT — including every UNCACHED query sitting
// beside it. One `{ revalidate: 300 }` on a `revalidate = 86400` page re-runs
// that entire page 288× a day instead of once.
//
// Cost, measured: components/EbayCardPanel.tsx did this to /card/[id] until
// 2026-08-14 — ~10 uncached round trips × ~60 KB × 288 × ~200 hot card URLs
// ≈ 2 GB/day, which matched the observed Neon burn almost exactly. Nine Neon
// projects have now been exhausted at roughly that rate.
//
// The 2026-08-14 sweep fixed /card/[id] and MISSED /movers, which sat at
// `{ revalidate: 600 }` under `export const revalidate = 86400` — 144× a day —
// until 2026-08-22. A one-off grep is evidently not enough; hence this test.
//
// If a surface genuinely needs fresher data than its page, fetch it CLIENT-side.
// That is the only way a TTL cannot propagate to the segment. Raising the page's
// own `export const revalidate` down to match is also fine — what must never
// happen is the two disagreeing, because only one of them is real.
// ─────────────────────────────────────────────────────────────────────────────

test("no unstable_cache TTL undercuts its own route's export const revalidate", () => {
  const offenders: string[] = [];

  for (const file of walk(APP)) {
    const src = readFileSync(file, "utf8");
    const page = /^export const revalidate\s*=\s*(\d[\d_]*)/m.exec(src);
    if (!page) continue; // dynamic or force-dynamic — no segment TTL to undercut
    const pageTtl = Number(page[1].replace(/_/g, ""));

    for (const m of src.matchAll(/revalidate:\s*(\d[\d_]*)/g)) {
      const inner = Number(m[1].replace(/_/g, ""));
      if (inner >= pageTtl) continue;
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(
        `${relative(ROOT, file)}:${line} — inner revalidate=${inner} under page revalidate=${pageTtl} ` +
          `(segment regenerates ${Math.floor(pageTtl / inner)}x more often than declared)`
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "an inner cache TTL below the page's drags the WHOLE segment down to it — every uncached query on the page re-runs at the shorter interval:\n" +
      offenders.join("\n")
  );
});
