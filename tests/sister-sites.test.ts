import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES } from "../src/lib/articles";
import { SISTER_SITES, sisterSitesFor } from "../src/lib/sister-sites";

// ─────────────────────────────────────────────────────────────────────────────
// The owner's four sites cross-link (2026-10-14, "Sister sites" in DECISIONS.md):
// every footer, plus the articles where another game is the subject. Plain
// followed links, and never on every article.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const published = ARTICLES.filter((a) => !a.draft);

test("the ten sister sites, each linking only its own https host", () => {
  assert.deepEqual(
    SISTER_SITES.map((s) => s.url),
    ["https://opcompare.app", "https://www.dexcompare.app", "https://mtgcompare.app", "https://gundamcompare.com", "https://lorcanacompare.com", "https://ygocompare.com", "https://wargamecompare.com", "https://figurecompare.com", "https://www.camcompare.app", "https://www.compareempire.com"],
  );
  for (const s of SISTER_SITES) {
    assert.ok(s.links.length > 0, s.name);
    const host = new URL(s.url).host;
    for (const l of s.links) assert.equal(new URL(l.href).host, host, `${s.name}: ${l.href}`);
  }
});

test("the cross-game guides link their own game's site; buying reading links all three; most articles none", () => {
  const bySlug = (slug: string) => {
    const a = published.find((x) => x.slug === slug);
    assert.ok(a, `${slug} is published`);
    return sisterSitesFor(a).map((s) => s.key);
  };
  assert.deepEqual(bySlug("one-piece-tcg-to-riftbound"), ["op"]);
  assert.deepEqual(bySlug("pokemon-collector-to-riftbound"), ["dex"]);
  assert.deepEqual(bySlug("mtg-to-riftbound"), ["mtg"]);
  assert.deepEqual(bySlug("where-to-buy-riftbound-cards"), ["op", "dex", "mtg"]);
  assert.deepEqual(bySlug("where-to-buy-riftbound-radiance"), ["op", "dex", "mtg"]);
  assert.deepEqual(bySlug("buy-riftbound-cards-australia"), ["op", "dex", "mtg"]);
  assert.deepEqual(bySlug("riftbound-radiance-spoilers"), []);
  // Not a link network: the AdSense plan keeps cross-links to the footer, About
  // and where they serve the reader (docs/adsense-remediation.md, Phase 15).
  const linking = published.filter((a) => sisterSitesFor(a).length > 0);
  assert.ok(linking.length <= published.length / 3, `${linking.length} of ${published.length} articles link the sister sites`);
});

test("footer and article block: plain followed links, rendered from the one list", () => {
  const layout = read("src/app/layout.tsx");
  const footer = layout.slice(layout.indexOf("<footer"), layout.indexOf("</footer>"));
  assert.match(footer, /SISTER_SITES\.filter\(\(s\) => !s\.notTcg\)\.map/);
  assert.match(footer, /SISTER_SITES\.filter\(\(s\) => s\.notTcg\)\.map/);
  const block = read("src/components/SisterSites.tsx");
  for (const src of [footer.slice(footer.indexOf("SISTER_SITES.filter")), block]) {
    const anchors = [...src.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(anchors.length > 0);
    for (const a of anchors.filter((x) => /s\.url|l\.href/.test(x))) {
      assert.match(a, /rel="noopener"/, a);
      assert.doesNotMatch(a, /nofollow|sponsored|noreferrer/, a);
    }
  }
  assert.match(read("src/components/ArticleView.tsx"), /<SisterSites sites=\{sisterSitesFor\(article\)\} \/>/);
});

test("search another game: every card-game sister site has a search link on its own host; no non-TCG site does", async () => {
  const { familySearchLinks } = await import("../src/lib/sister-sites");
  const links = familySearchLinks("Monkey D. Luffy");
  assert.deepEqual(links.map((l) => l.key), ["op", "dex", "mtg", "gundam", "lorcana", "ygo"]);
  for (const l of links) {
    const site = SISTER_SITES.find((s) => s.key === l.key)!;
    assert.equal(new URL(l.href).host, new URL(site.url).host, l.href);
    assert.equal(new URL(l.href).searchParams.get("q"), "Monkey D. Luffy", l.href);
  }
  assert.deepEqual(familySearchLinks("   "), []);
  const block = read("src/components/FamilySearch.tsx");
  assert.match(block, /rel="noopener nofollow"/);
  assert.match(read("src/app/browse/page.tsx"), /\{q && <FamilySearch q=\{q\}/);
});
