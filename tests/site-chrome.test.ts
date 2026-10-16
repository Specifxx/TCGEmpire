import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BANNER_FREE_ROUTES, footerBannersAllowed } from "../src/components/FooterAds";
import { STATIC_PAGE_DATE_PATHS } from "../src/lib/static-page-dates";

// ─────────────────────────────────────────────────────────────────────────────
// The site's chrome after the AdSense "low value content" brief (2026-09-26,
// "Blog and tools, joined up" in DECISIONS.md): the footer's always-visible
// links, which pages carry the footer banner pair, the sitemap's scheme, and
// the six arcade mini-games that lost their in-page banners and gained real
// how-to-play copy. The header's Tools link is pinned in tests/sidenav.test.ts
// and the rail/menu policies in tests/nav-menu-full-grid.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── The footer's always-visible row ─────────────────────────────────────────

test("the footer's always-visible row links every page the brief names, in order, outside the site map", () => {
  const layout = codeOnly(read("src/app/layout.tsx"));
  const footer = layout.slice(layout.indexOf("<footer"), layout.indexOf("</footer>"));
  assert.ok(footer.length > 0, "expected the <footer>");
  // The row sits AFTER <FooterNav />: the site map is a <details> closed on "/"
  // and on phones, so a link that lives only inside it is invisible there.
  const row = footer.slice(footer.indexOf("<FooterNav />"));
  const links = [...row.matchAll(/<Link href="([^"]+)" className="tap-link text-slate-300 hover:text-brand-400">([^<]+)<\/Link>/g)].map(
    (m) => [m[1], m[2]],
  );
  assert.deepEqual(links, [
    ["/", "Home"],
    ["/blog", "Blog"],
    ["/guides", "Guides"],
    ["/tools", "Tools"],
    ["/about", "About us"],
    ["/editorial-policy", "Editorial policy"],
    ["/methodology", "Methodology"],
    ["/authors", "Who writes this"],
    ["/contact", "Contact &amp; feedback"],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of service"],
  ]);
  // Still no "·" separators between them (2026-09-23): they wrapped apart
  // from their links and were read aloud as "middle dot".
  assert.doesNotMatch(row.slice(0, row.indexOf("DISCORD_URL")), /·/, "no middle-dot separators in the link row");
});

test("the site map's <details> behaviour is untouched: closed on the homepage, one copy", () => {
  const toggle = codeOnly(read("src/components/HomeFooterToggle.tsx"));
  assert.match(toggle, /open=\{!isHome\}/, "the homepage keeps its site map one click away");
  const layout = codeOnly(read("src/app/layout.tsx"));
  assert.equal(layout.match(/<FooterNav \/>/g)?.length, 1, "FOOTER_GROUPS renders once");
});

// ── Footer banners: none on the policy and trust pages ──────────────────────

test("the policy and trust pages carry no footer banner pair; every other route keeps it", () => {
  for (const path of ["/privacy", "/terms", "/editorial-policy", "/methodology", "/about", "/authors", "/authors/riftcompare-editorial", "/contact", "/support"]) {
    assert.equal(footerBannersAllowed(path), false, `${path} must render no banner pair`);
  }
  for (const path of ["/", "/browse", "/card/some-card", "/trade", "/blog", "/guides/some-guide", "/tools", "/stores/tracked", "/aboutness", "/termsheet"]) {
    assert.equal(footerBannersAllowed(path), true, `${path} keeps the banner pair`);
  }
  // No pathname yet is not a reason to drop the pair.
  assert.equal(footerBannersAllowed(null), true);
  // Every listed route is a real page, so a typo cannot silently do nothing.
  for (const r of BANNER_FREE_ROUTES) assert.ok(existsSync(join(ROOT, `src/app${r}/page.tsx`)), `${r} is not a route`);
});

test("FooterAds never renders a banner without its disclosure line", () => {
  const src = codeOnly(read("src/components/FooterAds.tsx"));
  // One early return covers both reasons for no banners, so the zone (both
  // banners AND the combined line under them) goes or stays as a whole.
  assert.match(src, /if \(adFree \|\| !footerBannersAllowed\(pathname\)\) return null;/);
  const zone = src.slice(src.indexOf('id="rc-ad-zone"'));
  const ebay = zone.indexOf("<EbayAd ");
  const tcg = zone.indexOf("<TcgplayerAd ");
  const line = zone.indexOf('<AffiliateDisclosure partner="both"');
  assert.ok(ebay > 0 && tcg > ebay && line > tcg, "eBay, then TCGplayer, then the one disclosure line for both");
  assert.equal(src.match(/<(EbayAd|TcgplayerAd) /g)?.length, 2, "no other banner path in the component");
});

// ── Sitemap ─────────────────────────────────────────────────────────────────

const SITEMAP = read("src/lib/sitemap-sections.ts");
const entry = (path: string) =>
  new RegExp(`\\{ url: \`\\$\\{SITE_URL\\}${path.replace(/\//g, "\\/")}\`, changeFrequency: "(\\w+)", priority: ([\\d.]+)`).exec(SITEMAP);

test("/alerts is submitted, with a hand-kept lastmod", () => {
  assert.match(SITEMAP, /\{ url: `\$\{SITE_URL\}\/alerts`, changeFrequency: "monthly", priority: 0\.6, lastModified: staticPageDate\("\/alerts"\) \}/);
});

test("every hand-kept sitemap date exists, or the whole core section would be empty", () => {
  // staticPageDate() throws on an unlisted route, and buildSection() turns a
  // throw into an EMPTY section — so one missing date silently unsubmits the
  // homepage, the tools and every trust page at once.
  const used = [...SITEMAP.matchAll(/staticPageDate\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(used.length > 20, "expected the sitemap's hand-dated routes");
  const missing = [...new Set(used)].filter((p) => !STATIC_PAGE_DATE_PATHS.includes(p));
  assert.deepEqual(missing, [], `add these to STATIC_PAGE_DATES in src/lib/static-page-dates.ts: ${missing.join(", ")}`);
});

test("the sitemap's priorities follow one scheme", () => {
  const check = (path: string, freq: string, priority: number) => {
    const m = entry(path);
    assert.ok(m, `${path} is not in the sitemap`);
    assert.equal(m![1], freq, `${path} changeFrequency`);
    assert.equal(Number(m![2]), priority, `${path} priority`);
  };
  // The editorial hubs first.
  check("/blog", "daily", 0.8);
  check("/guides", "daily", 0.8);
  // Tools and data pages 0.7-0.8.
  check("/tools", "weekly", 0.8);
  check("/tools/box-ev", "daily", 0.7);
  check("/tools/selling-fees", "monthly", 0.7);
  check("/deck", "weekly", 0.7);
  // Policy and trust pages 0.4-0.5, monthly.
  for (const p of ["/about", "/editorial-policy", "/methodology", "/authors"]) check(p, "monthly", 0.5);
  for (const p of ["/contact", "/support", "/privacy", "/terms"]) check(p, "monthly", 0.4);
  // The arcade mini-games 0.5 (pack-sim and sealed-bid carry real editorial
  // and keep their own values; pack-sim's is pinned in pack-composition.test.ts).
  // Card Rain and Pairs retired 2026-10-16, and Riftbound 2048 the same day;
  // Seraphine's Piano, the spotlight game, is 0.6.
  for (const g of ["higher-lower", "price-check", "zoomed", "card-smash"]) check(`/games/${g}`, "monthly", 0.5);
  check("/games/seraphines-piano", "monthly", 0.6);
  // Articles.
  assert.match(SITEMAP, /changeFrequency: "monthly" as const,\s*priority: 0\.7,\s*lastModified: new Date\(`\$\{a\.updated \?\? a\.date\}/);
});

test("/decks is submitted only when a deck is live, because an empty library is noindexed", () => {
  const body = SITEMAP.slice(SITEMAP.indexOf("async function deckEntries"));
  const gate = body.indexOf("if (!newest) return [];");
  const decks = body.indexOf("${SITE_URL}/decks`");
  assert.ok(gate > 0 && decks > gate, "the /decks row must come after the no-live-deck gate");
  // The gate reads the same rows the page's noindex does.
  assert.match(body, /where: \{ status: "live" \}/);
  assert.match(read("src/app/decks/page.tsx"), /decks !== null && decks\.length === 0 \? \{ robots: \{ index: false, follow: true \} \}/);
});

// ── The six arcade mini-games ───────────────────────────────────────────────

const MINI_GAMES = ["card-smash", "higher-lower", "price-check", "zoomed"] as const;

// 2026-10-02 (owner, from Reddit feedback): the arcade is ad-free for every
// visitor. No in-page pair, no AdSense slot, and no footer pair on /games/* or
// /riftle. Ads stay on the buying pages.
test("the arcade is ad-free: no in-page pair, no AdSlot, no footer pair", () => {
  const pages = [...MINI_GAMES.map((g) => `src/app/games/${g}/page.tsx`), "src/app/games/page.tsx", "src/app/games/sealed-bid/page.tsx", "src/app/games/seraphines-piano/page.tsx", "src/app/riftle/page.tsx"];
  for (const f of pages) {
    const page = codeOnly(read(f));
    assert.doesNotMatch(page, /<(TcgplayerAd|EbayAd|AdSlot)\b/, `${f}: no ad unit`);
  }
  assert.doesNotMatch(codeOnly(read("src/components/games/shared.tsx")), /<AdSlot\b/, "GameShell carries no AdSlot");
  for (const path of ["/games", "/games/seraphines-piano", "/games/sealed-bid", "/riftle"]) {
    assert.equal(footerBannersAllowed(path), false, `${path} must render no footer pair`);
  }
  assert.equal(footerBannersAllowed("/gamestop"), true, "a prefix is not a route");
});

test("each mini-game explains itself in 150+ words, then links the guides behind it", () => {
  const seen = new Map<string, string>();
  for (const g of MINI_GAMES) {
    const page = read(`src/app/games/${g}/page.tsx`);
    const start = page.indexOf("How to play");
    const end = page.indexOf("</section>", start);
    assert.ok(start > 0 && end > start, `${g}: the "How to play" section`);
    const paragraphs = page.slice(start, end).match(/<p className/g)?.length ?? 0;
    assert.ok(paragraphs >= 2 && paragraphs <= 3, `${g}: 2-3 paragraphs, found ${paragraphs}`);
    const text = page
      .slice(start + "How to play".length, end)
      .replace(/<[^>]+>/g, " ")
      .replace(/\{" "\}/g, " ")
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    const words = text.split(" ").length;
    assert.ok(words >= 150, `${g}: ${words} words of how-to-play, want 150+`);
    // Page-specific: the audit discounts a sentence repeated across a
    // template's pages as boilerplate.
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const other = seen.get(sentence);
      assert.ok(!other, `${g} repeats a sentence from ${other}: "${sentence}"`);
      seen.set(sentence, g);
    }
    const related = page.indexOf(`<RelatedGuides guides={guidesForTool("/games/${g}")}`);
    assert.ok(related > end, `${g}: RelatedGuides for its own route, after the how-to-play`);
  }
});

test("Riftbound 2048 is retired: no page, no registry entry, no links, and its URL 301s to the arcade", () => {
  // Owner, 2026-10-16: "get rid of riftbound 2048".
  for (const p of ["src/components/games/Twenty48.tsx", "src/app/games/twenty48/page.tsx"]) {
    assert.ok(!existsSync(join(process.cwd(), p)), `${p} should be gone`);
  }
  assert.doesNotMatch(read("src/lib/games.ts"), /^\s*twenty48:/m, "no leaderboard entry");
  for (const f of ["src/components/nav-groups.ts", "src/app/games/page.tsx", "src/lib/sitemap-sections.ts", "src/lib/content/tool-guides.ts"]) {
    assert.doesNotMatch(read(f), /\/games\/twenty48|Riftbound 2048/, `${f} still links the retired game`);
  }
  const cfg = read("next.config.js");
  const at = cfg.indexOf('source: "/games/twenty48"');
  assert.ok(at > 0, "the old URL must redirect");
  assert.match(cfg.slice(at, at + 120), /destination: "\/games",\s*permanent: true/);
});
