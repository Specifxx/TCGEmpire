import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(join(process.cwd(), "package.json"));
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Static image caching and the card-page LCP preload (2026-09-20).
//
// Speed Insights: /card/[id] at 4.42s LCP, element `picture>img.relative.z-10…`
// — CardImage's hero. Two causes, both measured on the live site:
//
//   1. The image could not be cached. Next only marks /_next/static/* immutable;
//      everything in public/ took Vercel's default and the 104 KB hero came back
//      `public, max-age=0, must-revalidate` with `x-vercel-cache: MISS`.
//   2. The fetch could not start early. `loading="eager" fetchPriority="high"`
//      does nothing until the parser reaches the element, and on that page the
//      element sits 51 KB into a 450 KB document.
//
// Both fixes have a failure mode that is invisible in review, which is what
// these tests are for: a cache rule that also matches an HTML route, an
// ordering that silently downgrades the immutable rule, and a preload whose
// href disagrees with what <picture> actually picks (two copies of the site's
// largest image, downloaded on every card page).
// ─────────────────────────────────────────────────────────────────────────────

type Rule = { source: string; headers: { key: string; value: string }[] };

async function imageRules(): Promise<Rule[]> {
  const cfg = require_(join(process.cwd(), "next.config.js"));
  const rules: Rule[] = await cfg.headers();
  return rules.filter((r) => r.headers.some((h) => h.key.toLowerCase() === "cache-control"));
}

const cacheValue = (r: Rule) => r.headers.find((h) => h.key.toLowerCase() === "cache-control")!.value;

test("the image cache rules cannot match an HTML route", () => {
  // The trap this replaced: `/blog/:path*` matches `/blog/<slug>`, a real page,
  // and would have put 24h of BROWSER caching on article HTML — an edit would
  // stay invisible to anyone who had already opened it, with nothing to recall
  // it. /sealed and /premium are the same shape. Extension-scoped rules cannot.
  const { pathToRegexp } = require_("next/dist/compiled/path-to-regexp");
  const pages = ["/", "/privacy", "/sealed", "/premium", "/blog", "/blog/riftbound-radiance-what-we-know",
                 "/card/irelia-fervent-sfd-225s-221", "/browse", "/games", "/embed/card/x"];
  return imageRules().then((rules) => {
    assert.ok(rules.length >= 2, "expected the static-image cache rules");
    for (const r of rules) {
      const re = pathToRegexp(r.source);
      for (const p of pages) {
        assert.equal(re.exec(p), null, `${r.source} matches the page route ${p}`);
      }
    }
  });
});

test("content-hashed card art is immutable, and everything else is not", async () => {
  const { pathToRegexp } = require_("next/dist/compiled/path-to-regexp");
  const rules = await imageRules();
  // Later rules win for a repeated key, so the EFFECTIVE value is the last match.
  const effective = (p: string) => {
    let v: string | null = null;
    for (const r of rules) if (pathToRegexp(r.source).exec(p)) v = cacheValue(r);
    return v;
  };

  // public/card-art/*.webp — the filename carries the content hash, so a changed
  // image is a changed URL and a year of immutable caching is provably safe.
  assert.match(
    effective("/card-art/ogn-001-298-8de89b4b8fb3186d.webp") ?? "",
    /max-age=31536000.*immutable/,
    "the measured LCP directory must be immutable — this is the ordering test too: " +
      "with the catch-all last, card art silently takes the weaker 24h value instead",
  );

  // Everything else reuses its URL when replaced, so it must stay revalidatable.
  for (const p of [
    "/signature-cards/akali-rogue-assassin-ven189.webp",
    "/blog/astral-heron-ven044.jpg",
    "/rune-variants/body-rune-ogn-126b.avif",
    "/icon-512.png",
  ]) {
    const v = effective(p) ?? "";
    assert.doesNotMatch(v, /immutable/, `${p} is not content-hashed and must never be immutable`);
    assert.match(v, /max-age=86400/, `${p} should still be cached rather than revalidated every view`);
  }
});

test("the card hero is preloaded, and only the hero", () => {
  const src = read("src/components/CardImage.tsx");
  assert.match(src, /import ReactDOM from "react-dom";/);
  // Gated on `priority`, which exactly one call site passes — the card-detail
  // hero. Preloading a grid of lazy tiles would do the opposite of this fix.
  const at = src.indexOf("if (priority) {");
  assert.ok(at > 0, "the preload must be gated on the priority prop");
  const gate = src.slice(at, src.indexOf("return (", at));
  assert.equal((src.match(/ReactDOM\.preload\(/g) ?? []).length, 3, "three branches, all inside the gate");
  assert.equal((gate.match(/ReactDOM\.preload\(/g) ?? []).length, 3, "every preload must be inside the gate");

  const page = read("src/app/card/[id]/page.tsx");
  assert.match(page, /<CardImage card=\{card\} full priority/, "the card hero is the one priority call site");
});

test("the preload resolves to the same file <picture> picks", () => {
  // A preload that disagrees with the chosen <source> downloads the page's
  // largest image twice. Each branch must mirror its source exactly, and the
  // `sizes` string has to be ONE constant — a preload whose imagesizes differs
  // from the source's sizes selects a different srcset entry.
  const src = read("src/components/CardImage.tsx");
  assert.match(src, /const sizes = full \? "\(max-width: 640px\) 90vw, 420px" : "220px";/);
  assert.match(src, /<source type="image\/webp" srcSet=\{webpSrcSet\} sizes=\{sizes\} \/>/);
  assert.equal((src.match(/\(max-width: 640px\) 90vw, 420px/g) ?? []).length, 1, "the sizes string must not be duplicated");

  // AVIF branch mirrors `<source type="image/avif" srcSet={meta.avif}>`; the
  // `type` is what stops a non-AVIF browser fetching a file it cannot use.
  assert.match(src, /ReactDOM\.preload\(meta\.avif, \{ as: "image", type: "image\/avif"/);
  assert.match(src, /imageSrcSet: webpSrcSet,\s*\n\s*imageSizes: sizes,/);
  // …and the no-manifest case preloads the img's own src, which is what a bare
  // <img> with no <source> actually fetches.
  assert.match(src, /ReactDOM\.preload\(src, \{ as: "image", fetchPriority: "high" \}\);/);
});
