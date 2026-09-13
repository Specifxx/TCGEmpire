import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cardImageSrc, liveCardImage } from "../src/lib/card-image-url";

// ─────────────────────────────────────────────────────────────────────────────
// Card art stopped rendering across the whole site in September 2026: the
// RiftScribe CDN dropped its `cards/originals/` tree (and `thumbnails/medium/`
// with it), and every Card row still stores one of those PNG URLs in
// `imageUrl`. Nothing was null, so every `imageUrl ?? imageThumbUrl` fallback
// in the codebase happily picked the dead URL — the card-detail hero, the
// article close-ups, the OG unfurls, the JSON-LD `image`, the image sitemap and
// the public API all pointed at a 404.
//
// lib/card-image-url.ts is now the ONE place that answers "where is this card's
// picture", by rewriting the dead prefix onto `thumbnails/large/` (744×1039 —
// bigger than any slot on the site). This file pins the rewrite, and pins that
// no render path goes back to reading `card.imageUrl` raw.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const DEAD = "https://cdn.riftscribe.gg/cards/originals/";
const LIVE = "https://cdn.riftscribe.gg/cards/thumbnails/large/";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

test("the dead originals path is rewritten onto the rendition the CDN still serves", () => {
  assert.equal(
    liveCardImage(`${DEAD}ogn-029-298-723927dee729ccc5.png`),
    `${LIVE}ogn-029-298-723927dee729ccc5.webp`
  );
  // Star/variant stems and every set prefix go through the same stem swap.
  assert.equal(
    liveCardImage(`${DEAD}unl-228-star-219-0fceb798b48de9c4.png`),
    `${LIVE}unl-228-star-219-0fceb798b48de9c4.webp`
  );
});

test("anything that is not the dead path is returned untouched", () => {
  // Our own re-hosted Vendetta signature art (prisma/manual-cards.json) is a
  // genuine full-resolution file — `full` callers must keep getting it.
  const ours = "https://riftcompare.com/signature-cards/ven-001.jpg";
  assert.equal(liveCardImage(ours), ours);
  const thumb = `${LIVE}ogn-001-298-8de89b4b8fb3186d.webp`;
  assert.equal(liveCardImage(thumb), thumb);
  assert.equal(liveCardImage("data:image/jpeg;base64,abc"), "data:image/jpeg;base64,abc");
  assert.equal(liveCardImage(null), null);
  assert.equal(liveCardImage(undefined), null);
  assert.equal(liveCardImage(""), null);
});

test("a stem that would escape the thumbnail tree falls back rather than building a bad URL", () => {
  assert.equal(liveCardImage(`${DEAD}nested/ogn-001.png`), null);
  assert.equal(liveCardImage(DEAD), null);
});

test("cardImageSrc picks a live URL in both modes, and null only when the card has no art", () => {
  const riftscribe = {
    imageUrl: `${DEAD}sfd-114-221-41e857f6194065be.png`,
    imageThumbUrl: `${LIVE}sfd-114-221-41e857f6194065be.webp`,
  };
  // Both modes land on the surviving rendition — `full` no longer means "dead".
  assert.equal(cardImageSrc(riftscribe), riftscribe.imageThumbUrl);
  assert.equal(cardImageSrc(riftscribe, { full: true }), riftscribe.imageThumbUrl);

  // A row whose thumbnail was never written still renders, off the rewrite alone.
  assert.equal(cardImageSrc({ imageUrl: riftscribe.imageUrl, imageThumbUrl: null }), riftscribe.imageThumbUrl);

  // Our own art: `full` keeps the original, the tile still takes the thumbnail.
  const ours = { imageUrl: "https://riftcompare.com/signature-cards/ven-001.jpg", imageThumbUrl: "https://riftcompare.com/signature-cards/ven-001-thumb.jpg" };
  assert.equal(cardImageSrc(ours, { full: true }), ours.imageUrl);
  assert.equal(cardImageSrc(ours), ours.imageThumbUrl);

  // No art at all → null, so CardImage falls through to generated CardArt.
  assert.equal(cardImageSrc({ imageUrl: null, imageThumbUrl: null }), null);
  assert.equal(cardImageSrc({}), null);
});

test("no source file hard-codes the dead CDN path (articles included)", () => {
  const offenders: string[] = [];
  for (const f of [...walk(join(ROOT, "src")), join(ROOT, "prisma/seed.ts")]) {
    // The rewrite rule itself is where the prefix is allowed to be named.
    if (f.endsWith(join("lib", "card-image-url.ts"))) continue;
    if (readFileSync(f, "utf8").includes("cards/originals/")) offenders.push(f.slice(ROOT.length + 1));
  }
  assert.deepEqual(offenders, [], `hard-coded dead card-art URLs: ${offenders.join(", ")}`);
});

test("every card render path goes through the helper rather than reading imageUrl raw", () => {
  // CardImage is the shared renderer; the four below each build their own <img>
  // or metadata field and were each pointing at the dead URL.
  const mustUse = [
    "src/components/CardImage.tsx",
    "src/components/ArticleView.tsx",
    "src/components/DeckBuilder.tsx",
    "src/app/opengraph-image.tsx",
    "src/app/card/[id]/opengraph-image.tsx",
    "src/app/c/[token]/opengraph-image.tsx",
    "src/app/card/[id]/page.tsx",
    "src/app/api/card/[id]/route.ts",
    "src/lib/sitemap-sections.ts",
    "src/lib/public-api.ts",
  ];
  for (const rel of mustUse) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.match(src, /from "(@\/lib|\.)\/card-image-url"/, `${rel} must resolve card art through lib/card-image-url`);
    // …and must not read the raw column back out for rendering. (A Prisma
    // `imageUrl: true` select line is fine — that's how the helper gets fed.)
    const raw = src
      .split("\n")
      .filter((l) => /\.imageUrl\b/.test(l) && !/liveCardImage|cardImageSrc|^\s*\/\//.test(l));
    assert.deepEqual(raw, [], `${rel} still reads .imageUrl directly: ${raw.join(" | ")}`);
  }
});

test("the importers stop writing URLs the CDN no longer serves", () => {
  for (const rel of ["prisma/seed.ts", "scripts/sync-cards.ts"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.match(src, /imageUrl: liveCardImage\(c\.image\)/, `${rel} must normalise imageUrl on write`);
    // `medium` is gone too; `small` is the only other surviving rendition.
    assert.doesNotMatch(src, /image_thumb\?\.medium/, `${rel} must not fall back to the dead medium thumbnail`);
  }
});
