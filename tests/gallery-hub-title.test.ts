import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// /gallery: Search Console 28d to 2026-09-21 — "riftbound card gallery" 712
// impressions at position 9.1, 0.1% CTR; the page 1,271 impressions for 4
// clicks. The title matched the query and made no claim. It now carries the
// database's own card count. These pin the shape and the budgets without a
// database: the builders are pure functions of the count.

const src = readFileSync(join(process.cwd(), "src/app/gallery/page.tsx"), "utf8");
const seo = readFileSync(join(process.cwd(), "src/lib/gallery-seo.ts"), "utf8");

// Evaluate the two builders standalone from lib/gallery-seo.ts (pure functions).
function builders() {
  const fn = (name: string) => {
    const m = new RegExp(`export function ${name}\\(([^)]*)\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(seo);
    assert.ok(m, `${name} must be exported from lib/gallery-seo.ts`);
    return new Function(...m![1].split(",").map((a) => a.split(":")[0].trim()), m![2]) as (...a: unknown[]) => string;
  };
  return { title: fn("galleryTitle"), description: fn("galleryDescription") };
}

test("the gallery title leads with the query and carries the card count, inside 60 chars", () => {
  const { title } = builders();
  for (const n of [1431, 1598, 9999]) {
    const t = `${title(n)} | RiftCompare`;
    assert.match(t, /^Riftbound Card Gallery: All [\d,]+ Cards/, t);
    assert.ok(t.length <= 60, `${t} is ${t.length} chars`);
  }
  // A DB blip must not publish "All 0 Cards".
  assert.doesNotMatch(title(0), /\b0\b/);
  assert.match(title(0), /^Riftbound Card Gallery/);
});

test("the gallery description fits the SERP and names the count", () => {
  const { description } = builders();
  const five = ["Origins", "Origins: Proving Grounds", "Spirit Forged", "Unleashed", "Vendetta"];
  for (const [n, names] of [[1431, five], [9999, [...five, "Radiance", "Legacy", "The Reckoning", "Set 8"]], [0, []]] as const) {
    const d = description(n, [...names]);
    assert.ok(d.length >= 50 && d.length <= 155, `${d.length} chars for ${n}/${names.length}`);
    if (n > 0) assert.ok(d.includes(n.toLocaleString("en-US")), "must carry the count");
  }
  // The span follows the release list, so Radiance replaces Vendetta on its own.
  assert.match(description(1600, [...five, "Radiance"]), /Origins to Radiance/);
});

test("metadata and page share one cached query, and the H1 mirrors the title", () => {
  assert.ok(src.includes("const getSetCounts = cache("), "counts must go through React cache()");
  assert.ok(src.includes("export async function generateMetadata"), "title must be generated from the count");
  assert.ok(!src.includes("export const metadata"), "the static metadata export must be gone");
  assert.match(src, /<h1[^>]*>\s*Riftbound card gallery\{total > 0/, "H1 must carry the same count");
  assert.ok(src.includes("catch {") && src.includes("return [];"), "the count query must fail open");
});
