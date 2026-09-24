import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES } from "../src/lib/articles";
import { RADIANCE_MERCH_DRAW, RADIANCE_PRODUCTS } from "../src/lib/sets/radiance";

// Where to buy Radiance, and the /radiance-preorders gaps it exposed
// (2026-09-24). DECISIONS.md, "Radiance pre-orders: the stores we were not
// reading, and where to buy", 2026-09-24.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SLUG = "where-to-buy-riftbound-radiance";

function post() {
  const a = ARTICLES.find((x) => x.slug === SLUG);
  assert.ok(a, `expected ${SLUG}`);
  return a!;
}

test("the post is published, radiance-tagged, and its title fits and leaves 'pre-order' to the price page", () => {
  const a = post();
  assert.ok(!a.draft);
  assert.equal(a.category, "blog");
  assert.ok(a.tags.includes("radiance"), "radiance tag drives the launch capture and the related rail");
  assert.ok(`${a.title} — RiftCompare`.length <= 60, `${a.title.length} chars before the suffix`);
  // docs/seo-keyword-map.md: /radiance-preorders owns "radiance preorder".
  assert.doesNotMatch(a.title, /pre-?order/i);
  assert.ok(read("docs/seo-keyword-map.md").includes(`/blog/${SLUG}`));
});

test("the thumbnail exists at the share-card ratio, within the image budget, with renditions", () => {
  const a = post();
  assert.equal(a.hero?.src, `/blog/${SLUG}.jpg`);
  const file = join(process.cwd(), "public", a.hero!.src);
  assert.ok(existsSync(file));
  assert.ok(readFileSync(file).length <= 150 * 1024, "scripts/check-images.ts MAX_BYTES");
  const manifest = JSON.parse(read("public/image-manifest.json"));
  const entry = manifest[a.hero!.src];
  assert.ok(entry?.webp && entry?.avif, "run npm run images:optimize after regenerating");
  assert.equal(entry.width, 1200);
  assert.equal(entry.height, 630);
});

test("every price question goes to the live table, and store prices are dated", () => {
  const a = post();
  assert.ok((a.body.match(/\]\(\/radiance-preorders\)/g) ?? []).length >= 3);
  assert.equal(a.browseCta?.href, "/radiance-preorders");
  // Quoted store prices are that-day examples; the body must say which day.
  assert.match(a.body, /read on each store's own page on 24 September 2026/);
  for (const href of ["/blog/riftbound-radiance-spoilers", "/blog/riftbound-radiance-what-we-know", "/guides/where-to-buy-riftbound-cards"]) {
    assert.ok(a.body.includes(`](${href})`), `must link ${href}`);
  }
});

test("the post and the pre-order page agree with radiance.ts on the Merch Store draw and MSRPs", () => {
  const a = post();
  assert.equal(RADIANCE_MERCH_DRAW.signupOpens, "2026-09-25");
  assert.equal(RADIANCE_MERCH_DRAW.signupCloses, "2026-09-30");
  assert.match(a.body, /\| Sign-ups open \| 25 September 2026 \|/);
  assert.match(a.body, /\| Sign-ups close \| 30 September 2026, 9:00 AM Pacific \(16:00 UTC\) \|/);
  assert.match(a.body, new RegExp(RADIANCE_MERCH_DRAW.regions));
  const msrps = RADIANCE_PRODUCTS.map((p) => p.msrp).filter(Boolean).join(" ");
  for (const price of ["$4.99", "$120", "$34.99"]) {
    assert.ok(msrps.includes(price), `radiance.ts lost ${price}`);
    assert.ok(a.body.includes(`US${price}`), `post lost US${price}`);
  }
});

test("/radiance-preorders explains the products and the draw, from radiance.ts, and links the new post", () => {
  const page = read("src/app/radiance-preorders/page.tsx");
  assert.match(page, /\{RADIANCE_PRODUCTS\.map\(\(p\) =>/, "the product guide renders the shared list, never a typed copy");
  assert.match(page, /US MSRP \{p\.msrp\}/);
  assert.match(page, /Buying from Riot: the Merch Store draw/);
  assert.match(page, /dayMonth\(RADIANCE_MERCH_DRAW\.signupCloses\)/);
  assert.match(page, /q: "What is the difference between the Radiance Vault and the Vault Bundle\?"/);
  assert.match(page, /href="\/blog\/where-to-buy-riftbound-radiance"/);
  assert.match(page, /href="\/blog\/riftbound-radiance-spoilers"/);
  assert.doesNotMatch(page, /the Radiance Vault, Showdown/, "the metadata names the product the way the table groups it");
});

test("the spoiler tracker states the reveal schedule and no longer claims delivered-cost ranking", () => {
  const t = ARTICLES.find((x) => x.slug === "riftbound-radiance-spoilers")!;
  assert.ok(t.hero, "the tracker carries a thumbnail");
  assert.match(t.body, /twice a day, at about 02:30 and 18:30 UTC/);
  assert.doesNotMatch(t.body, /delivered cost/, "the pre-order table ranks by item price");
  assert.ok(t.body.includes(`](/blog/${SLUG})`));
  const wf = read(".github/workflows/radiance-reveals.yml");
  assert.match(wf, /cron: "30 18 \* \* \*"/);
  assert.match(wf, /cron: "30 2 \* \* \*"/);
});
