import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardImageForOg } from "../src/lib/card-image-url";
import {
  generateRisingTitle,
  generateRisingSubtitle,
  hotListName,
  snapshotDateLabel,
  type RisingSnapshotData,
  type RisingSnapshotPick,
} from "../src/lib/rising-snapshot";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The generated title for a Rising Cards snapshot (2026-09-22, owner: "generates
// an actual useful title for rising cards").
//
// "Useful" has a testable meaning here: the title must say what THIS run found,
// so two snapshots taken on different days are distinguishable from their titles
// alone. A constant string ("Rising cards") fails that by construction.
//
// The harder requirement is the one /editorial-policy imposes — "nothing here
// describes a process we don't actually run" — which applies to a headline as
// much as to an article. Every number in the title has to be one the run
// measured, and no branch may predict. The tool itself is labelled "a research
// signal, not advice"; a title that promised a rise would make that disclaimer a
// lie the moment anyone read the page.
// ─────────────────────────────────────────────────────────────────────────────

const AT = new Date("2026-09-22T03:00:00Z");

function pick(over: Partial<RisingSnapshotPick> = {}): RisingSnapshotPick {
  return {
    id: "c1", slug: "jinx", displayName: "Jinx, Loose Cannon", setCode: "OGN",
    collectorNumber: "042", imageThumbUrl: null, score: 91, priceCents: 1299,
    currency: "USD", trend7: 0, trend30: 0, posPct: 0.5, listings: 7,
    spark: [1200, 1250, 1299], confidence: "High", ...over,
  };
}
function data(picks: RisingSnapshotPick[], over: Partial<RisingSnapshotData> = {}): RisingSnapshotData {
  return {
    scope: "US", generatedAt: AT.toISOString(), picks,
    universeSize: 400, qualifying: 180, minPointsRequired: 14, ...over,
  };
}

test("a card already moving leads the title, with its real 7-day figure", () => {
  const t = generateRisingTitle(data([pick({ trend7: 18.4 }), pick({ id: "c2" })]), AT);
  assert.match(t, /Jinx, Loose Cannon is up 18\.4% this week/);
  assert.match(t, /22 September 2026/);
  // The count moved INTO the list's name on 2026-09-22 ("RiftCompare Hot 2")
  // rather than being repeated as a clause — see HOT_LIST_BRAND.
  assert.match(t, /^RiftCompare Hot 2: /);
});

test("with nothing moving yet, it names the screener's actual thesis instead", () => {
  // posPct 0.12 = near the bottom of its own range, which IS the signal the
  // tool ranks on ("hasn't re-rated yet"). Saying so is more useful than a
  // generic count, and is still a measured fact.
  const t = generateRisingTitle(data([pick({ trend7: 1.2, posPct: 0.12 }), pick({ id: "c2" })]), AT);
  assert.match(t, /near their range low/);
  assert.match(t, /Jinx, Loose Cannon leads 2/);
});

test("with no single leader, breadth is the finding", () => {
  const picks = [
    pick({ trend7: 2, posPct: 0.8 }),
    pick({ id: "c2", trend7: 3 }),
    pick({ id: "c3", trend7: 1 }),
    pick({ id: "c4", trend7: -1 }),
  ];
  assert.match(generateRisingTitle(data(picks), AT), /^RiftCompare Hot 4: 3 of 4 cards gained ground/);
});

test("the list is named, and the number in the name is the REAL count", () => {
  // Owner, 2026-09-22: "we should call it the riftcompare hot 40". The cap in
  // rise-predictor is DISPLAY = 40, so a healthy run IS the Hot 40 — but a
  // market early in its price history ranks fewer, and printing "Hot 40" above
  // twelve rows would be the one kind of claim this file exists to prevent.
  assert.equal(hotListName(40), "RiftCompare Hot 40");
  assert.equal(hotListName(12), "RiftCompare Hot 12");

  const forty = generateRisingTitle(data(Array.from({ length: 40 }, (_, i) => pick({ id: `c${i}` }))), AT);
  assert.match(forty, /^RiftCompare Hot 40: /);

  const thin = generateRisingTitle(data([pick(), pick({ id: "c2" }), pick({ id: "c3" })]), AT);
  assert.match(thin, /^RiftCompare Hot 3: /, "a three-card run must not call itself the Hot 40");
  assert.ok(!thin.includes("Hot 40"), thin);
});

test("an empty run still gets an honest title rather than a crash or a lie", () => {
  // The screener legitimately has nothing while price history is building. A
  // link that says so beats a 400 that leaves the operator guessing whether the
  // feature broke — so the API mints empty runs and this branch names them.
  const t = generateRisingTitle(data([]), AT);
  assert.match(t, /no ranked cards/);
  assert.doesNotMatch(t, /leads|up \d/);
});

test("no branch predicts, promises or advises", () => {
  // Every shape the generator can emit, checked against the words that would
  // turn a measurement into a recommendation.
  const cases: RisingSnapshotData[] = [
    data([pick({ trend7: 22 })]),
    data([pick({ trend7: 0.5, posPct: 0.1 })]),
    data([pick({ trend7: 1, posPct: 0.9 }), pick({ id: "b", trend7: 2 }), pick({ id: "c", trend7: 3 })]),
    data([pick({ trend7: 1, posPct: 0.9 })]),
    data([]),
  ];
  const banned = /\b(will|guaranteed|profit|buy now|moon|surge|skyrocket|prediction|forecast)\b/i;
  for (const d of cases) {
    const t = generateRisingTitle(d, AT);
    assert.ok(!banned.test(t), `title makes a promise it cannot keep: ${t}`);
    assert.ok(t.length > 20 && t.length < 160, `title should be headline-shaped, got ${t.length} chars: ${t}`);
  }
});

test("two different runs produce two different titles — the whole point", () => {
  const a = generateRisingTitle(data([pick({ displayName: "Jinx, Loose Cannon", trend7: 12 })]), AT);
  const b = generateRisingTitle(data([pick({ displayName: "Shen, Eye of Twilight", trend7: 6 })]), AT);
  assert.notEqual(a, b, "a title that cannot tell two runs apart is the thing this replaced");
});

test("the subtitle states the sample and that the numbers are frozen", () => {
  const s = generateRisingSubtitle(data([pick()]));
  assert.match(s, /180 most-searched priced cards/);
  assert.match(s, /snapshot taken at one moment/i);
});

test("the date label is spelled out, not an ISO string", () => {
  assert.equal(snapshotDateLabel(new Date("2026-09-22T00:00:00Z")), "22 September 2026");
});

// ─────────────────────────────────────────────────────────────────────────────
// The surfaces around it.
// ─────────────────────────────────────────────────────────────────────────────

test("the public snapshot page is noindex and never recomputes", () => {
  const src = read("src/app/rising/[token]/page.tsx");
  assert.match(src, /robots:\s*\{\s*index:\s*false/, "a capability URL must not be indexed");
  // Reading the frozen column is the whole contract: recomputing would make
  // "snapshot" untrue AND spend the heaviest scan in the app on every view.
  assert.match(src, /snap\.data as unknown as RisingSnapshotData/);
  assert.ok(!/getCachedRisingCards/.test(src), "the public page must render the frozen payload, never re-run the screener");
  // No paywall of any kind — that is the feature.
  assert.ok(!/isPremium|PremiumButton/.test(src), "the shared link must work with no account and no Premium");
});

test("minting reuses the shared cached analysis rather than starting its own scan", () => {
  const src = read("src/app/api/admin/rising-snapshot/route.ts");
  assert.match(src, /getCachedRisingCards\(scope\)/);
  // getCachedRisingCards caches itself; wrapping it would disable that (see
  // tests/nested-cache.test.ts and the rule in CLAUDE.md).
  assert.ok(!/unstable_cache/.test(src), "never wrap a self-caching loader");
});

test("the mint route accepts a logged-in admin OR the ?key= token, like every admin page", () => {
  // The mismatch this avoids: a form on a page reached via ADMIN_TOKEN 403ing
  // against its own API — the exact bug store-partners' route documents.
  const src = read("src/app/api/admin/rising-snapshot/route.ts");
  assert.match(src, /process\.env\.ADMIN_TOKEN/);
  assert.match(src, /user\?\.isAdmin/);
});

test("the dashboard no longer links store report links or outbound clicks, but both routes survive", () => {
  const src = read("src/app/admin/page.tsx");
  assert.ok(!/href: "\/admin\/store-partners"/.test(src), "the store-report tile was removed from the index");
  assert.ok(!/href: "\/admin\/clicks"/.test(src), "the outbound-clicks tile was removed from the index");
  // Removed from the INDEX, not deleted — a link already sent still has to work.
  for (const p of ["src/app/admin/store-partners/page.tsx", "src/app/admin/clicks/page.tsx"]) {
    assert.ok(read(p).length > 0, `${p} must still exist`);
  }
});

test("a shared link unfurls with the top three and their deltas, from the frozen snapshot", () => {
  // Owner, 2026-09-22, in two passes: "a better thumbnail with the card at #1
  // featured", then "it should also have #2 and #3 and some delta figures".
  //
  // The composition lives in lib/, not in the route: a Next image route may
  // only export the names Next recognises, so a helper exported from
  // opengraph-image.tsx passes tsc and is then rejected by `next build`.
  const route = readFileSync(join(process.cwd(), "src/app/rising/[token]/opengraph-image.tsx"), "utf8");
  const art = readFileSync(join(process.cwd(), "src/lib/hot40-og.tsx"), "utf8");

  assert.match(route, /export const runtime = "nodejs"/, "Prisma cannot run on edge");
  assert.match(route, /export const size = HOT40_SIZE/);
  assert.match(route, /prisma\.risingSnapshot[\s\S]{0,160}where: \{ token: params\.token \}/, "must load THIS snapshot");
  assert.match(route, /\.catch\(\(\) => null\)/, "a failed lookup must not 500 the unfurl");
  assert.match(route, /picks=\{data\?\.picks \?\? \[\]\}/, "must draw the FROZEN picks");
  assert.ok(!/getCachedRisingCards/.test(route + art), "the image must never recompute the live ranking");

  // #1 featured, #2 and #3 beneath it.
  assert.match(art, /const top = picks\[0\]/, "the featured card is rank 1");
  assert.match(art, /const runners = picks\.slice\(1, 3\)/, "ranks 2 and 3, and no further");
  assert.match(art, /rank=\{i \+ 2\}/, "the runners are numbered from 2");

  // Delta figures: 7d and 30d on the leader, 7d on each runner.
  assert.match(art, /delta\(top\.trend7\)/);
  assert.match(art, /delta\(top\.trend30\)/);
  assert.match(art, /delta\(p\.trend7\)/, "each runner shows its own 7-day move");
  assert.match(art, /v >= 0 \? "\+" : "−"/, "the sign is explicit, never inferred");

  // THE FORMAT TRAP. cardImageSrc serves our WebP mirror, which satori cannot
  // decode — it lays the <img> out, draws the border, and fills it with
  // nothing. That is what the site-wide OG image shipped for months. Both OG
  // surfaces must use cardImageForOg, which hands back a PNG.
  for (const [file, src] of [["lib/hot40-og.tsx", art], ["app/opengraph-image.tsx", readFileSync(join(process.cwd(), "src/app/opengraph-image.tsx"), "utf8")]] as const) {
    assert.match(src, /cardImageForOg\(/, `${file} must use the OG-safe image helper`);
    assert.ok(!/cardImageSrc\(/.test(src), `${file} must not use the WebP mirror in an OG image`);
  }

  // Naming an image in generateMetadata would override the generated one.
  const page = readFileSync(join(process.cwd(), "src/app/rising/[token]/page.tsx"), "utf8");
  assert.ok(!/openGraph:\s*\{[\s\S]{0,200}images/.test(page), "the page must not set openGraph.images by hand");
});

test("the OG-safe image helper returns a format satori can actually decode", () => {
  const stem = "ogn-001-298-8de89b4b8fb3186d";
  // Any CDN rendition — thumbnail or original — resolves to the PNG original.
  for (const raw of [
    `https://cdn.riftscribe.gg/cards/thumbnails/large/${stem}.webp`,
    `https://cdn.riftscribe.gg/cards/originals/${stem}.png`,
  ]) {
    assert.equal(cardImageForOg({ imageThumbUrl: raw }), `https://cdn.riftscribe.gg/cards/originals/${stem}.png`);
  }
  // OUR OWN MIRROR PATH, both shapes. This is the case that made the first
  // version of the helper a no-op in production: rows written after the mirror
  // landed store /card-art/<stem>.webp, which is neither a CDN URL nor a
  // raster, so the helper returned null and the card slot stayed empty.
  for (const raw of [`https://riftcompare.com/card-art/${stem}.webp`, `/card-art/${stem}.webp`]) {
    assert.equal(cardImageForOg({ imageThumbUrl: raw }), `https://cdn.riftscribe.gg/cards/originals/${stem}.png`);
  }
  // Art we host ourselves is already a raster satori reads.
  assert.equal(
    cardImageForOg({ imageThumbUrl: "https://riftcompare.com/radiance-spoilers/neeko-blending-in.jpg" }),
    "https://riftcompare.com/radiance-spoilers/neeko-blending-in.jpg",
  );
  // Nothing it can vouch for → null, so the caller draws a placeholder rather
  // than an invisible broken image.
  assert.equal(cardImageForOg({ imageThumbUrl: null }), null);
  assert.equal(cardImageForOg({ imageThumbUrl: "https://example.com/art.webp" }), null);
});
