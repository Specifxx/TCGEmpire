import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// ONE OWNER PER QUERY — the rule docs/seo-keyword-map.md exists to enforce,
// asserted in code so a future title rewrite fails a test instead of quietly
// re-creating the cannibalization the map was written to prevent.
//
// Two queries are pinned here, both added 2026-09-17:
//
//   `riftbound card list`  → /browse
//   `riftbound price check` → / (homepage)
//
// Each had a real, findable problem before this pass, and neither was a
// "add the keyword everywhere" fix:
//
//   • The map's row for `riftbound card list` pointed at
//     `/guides/riftbound-card-list` as "not yet built, backlog item 12". Item 12
//     had in fact been closed on 2026-08-13 by shipping
//     `/guides/riftbound-sets-in-order` — a guide about which SETS exist, in
//     release order, which is not what anyone typing "card list" is asking for.
//     So the query had no owner at all while the map claimed it was merely
//     pending. /browse — literally the list of cards — now owns it in title+H1.
//
//   • `riftbound price check` had no row at all, and the only page on the site
//     whose <title> contained the phrase was /games/price-check: a five-round
//     guess-the-price MINI-GAME. That is the map's own rule-4 cannibalization
//     signal ("whose visible H1/title/meta-description already targets that
//     phrase") pointing at the wrong page entirely.
//
// SOURCE-LEVEL on purpose, matching tests/seo-landing-pages.test.ts: `npm test`
// runs with no server and no database, so rendered-HTML checks (scripts/
// seo-gate.ts, scripts/crawl-check.ts) cannot gate a PR. These can.
// ─────────────────────────────────────────────────────────────────────────────

const BROWSE = "src/app/browse/page.tsx";
const HOME = "src/app/page.tsx";
const HERO = "src/components/home/CinematicHero.tsx";
const GAME = "src/app/games/price-check/page.tsx";
const MAP = "docs/seo-keyword-map.md";

// ── `riftbound card list` → /browse ─────────────────────────────────────────

test("/browse owns 'Riftbound Card List' in both its title and its H1", () => {
  const src = read(BROWSE);
  assert.match(
    src,
    /title: q \? .* : `Riftbound Card List — Browse & Compare Prices\$\{pageSuffix\}`/,
    "the default (unsearched) /browse title must lead with the exact phrase",
  );
  assert.match(
    src,
    /<h1[^>]*>Riftbound Card List<\/h1>/,
    "the visible H1 must carry the same exact phrase as the title",
  );
});

test("/browse's own description carries the phrase too, and names every tracked market", () => {
  const src = read(BROWSE);
  assert.match(src, /The full Riftbound card list/, "description must carry the phrase");
  // The market list here was three launches out of date ("AU, US, UK & SG") —
  // Canada and the EU both shipped in August. A description naming markets that
  // do not match the homepage's is its own small trust problem, so it is pinned.
  // Scoped to the description literal rather than the whole file, so an unrelated
  // mention of a market name elsewhere in the route can't satisfy it.
  const desc = /The full Riftbound card list — every card in one database, with live prices compared across ([^"]+)"/.exec(src)?.[1] ?? "";
  assert.ok(desc, "expected the default (page 1) description literal");
  for (const market of ["US", "AU", "UK", "Singapore", "Canada", "EU"]) {
    assert.ok(desc.includes(market), `/browse description must name ${market} — got "${desc}"`);
  }
  assert.ok(!/across AU, US, UK & SG stores/.test(src), "the pre-CA/EU market list must be gone");
});

test("no other card-surface retitles onto 'Riftbound Card List'", () => {
  // /cards and /singles are the two nearest neighbours. Both legitimately talk
  // about browsing cards; neither may claim this page's exact phrase in a title.
  for (const f of ["src/app/cards/page.tsx", "src/app/singles/page.tsx"]) {
    const titleLine = /title: \{ absolute: "([^"]+)" \}/.exec(read(f))?.[1] ?? "";
    assert.ok(titleLine, `${f}: expected an absolute title`);
    assert.ok(
      !/card list/i.test(titleLine),
      `${f} must not compete with /browse for "riftbound card list" (title: ${titleLine})`,
    );
  }
});

// ── `riftbound price check` → / ─────────────────────────────────────────────

test("the homepage owns 'price check' in its description, hero subhead and an FAQ", () => {
  assert.match(read(HOME), /price check any card across/, "meta description must carry the phrase");
  assert.match(read(HERO), /Price check any card and find the cheapest place to buy/, "hero subhead must carry it");

  const home = read(HOME);
  assert.match(home, /q: "How do I price check a Riftbound card\?"/, "expected a dedicated FAQ question");
  // The FAQ array is the FAQPage JSON-LD source, so the question above is real
  // structured data rather than body copy — that link is what makes it worth
  // pinning here at all.
  assert.match(home, /faqPage\(FAQS\)/, "FAQS must still feed FAQPage JSON-LD");
});

test("the homepage's hard-won title HEAD TERM is NOT traded away for a long-tail", () => {
  // Three documented audits (2026-08-20, 08-30, 09-10) converged on the exact
  // phrase "Riftbound Card Prices", the last of them on live SERP evidence (the
  // page sat at #10 and was the only page-one result whose title lacked the
  // words). A pass reaching for "price check" — or, as of 2026-09-17, for the
  // "Buy Riftbound Cards" phrasing the H1 took on — would be swapping a proven
  // head-term match for an adjacent long-tail. That is the trade this refuses.
  //
  // AMENDED 2026-09-17, deliberately and by owner instruction: the "(US)"
  // market marker was dropped from the title ("it doesn't need to say US on the
  // Chrome tab header"). The marker was a separate 2026-08-30 decision from the
  // head term this test guards, so the assertion is narrowed to the head term
  // rather than deleted — and it now ALSO pins that the marker stays gone,
  // because silently reinstating it is the other half of the same drift.
  const title = /title: \{ absolute: "([^"]+)" \}/.exec(read(HOME))?.[1] ?? "";
  assert.ok(title, "expected an absolute title on the homepage");
  assert.ok(
    title.startsWith("Riftbound Card Prices"),
    `homepage title must still front-load 'Riftbound Card Prices' exactly — got "${title}"`,
  );
  assert.ok(!/\(US\)|\bUS\b/.test(title), `the market marker was removed on purpose — got "${title}"`);
  // Bing warns past 65; see card/[id]/page.tsx for why that number.
  assert.ok(title.length <= 65, `homepage title is ${title.length} chars, over the 65-char budget`);
});

test("the homepage H1 owns the market-free BUY query, and the title does not duplicate it", () => {
  // Owner call, 2026-09-17: the H1 pivoted from comparison intent ("Compare
  // Riftbound prices across every US store") to transactional intent. The split
  // that makes this safe is the point — `buy riftbound cards` lives in the H1,
  // `riftbound card prices` in the <title>, and neither field carries both.
  const hero = read(HERO);
  assert.match(
    hero,
    /Buy <span className="text-brand-400">Riftbound<\/span> cards at the best price/,
    "the hero H1 must carry the transactional phrase",
  );
  assert.doesNotMatch(hero, /Compare <span[^>]*>Riftbound<\/span> prices across every/, "the old comparison H1 must be gone");

  // The nearest neighbour for this phrase is the guide, whose title leads with
  // "Where to" (research intent: which stores exist). The homepage must not
  // claim the bare phrase in the one field that would actually collide.
  const title = /title: \{ absolute: "([^"]+)" \}/.exec(read(HOME))?.[1] ?? "";
  assert.ok(
    !/buy riftbound cards/i.test(title),
    `the homepage title must not compete with /guides/where-to-buy-riftbound-cards — got "${title}"`,
  );

  // The H1 gave up the "Riftbound prices" adjacency the 2026-08-20 audit fixed.
  // It is not allowed to simply vanish: the subhead took it over in the same
  // pass, and the About H2 + an FAQ carry it further down the page.
  assert.match(hero, /live Riftbound prices from/, "the hero subhead must carry the adjacency the H1 released");
  const home = read(HOME);
  assert.match(home, /<h2[^>]*>Riftbound prices in /, "the About section H2 must still carry it verbatim");
  assert.match(home, /q: "How do I find the cheapest Riftbound prices\?"/, "and so must the FAQ that feeds FAQPage JSON-LD");
});

test("root's H1 names no market; the four region pages' H1s each name their own", () => {
  // The 2026-08-30 "(US)" marker and this are the same concern — tell Google
  // which market a page is for — solved on the page instead of in the title.
  const hero = read(HERO);
  assert.match(
    hero,
    /\{region \? ` in \$\{SHORT_PLACE\[region\.code\]\}` : ""\}/,
    "the market clause must be region-only, so root's H1 stays market-free",
  );
  assert.ok(!/at the best price in the US/.test(hero), "root must not hard-code a market back into the H1");
});

test("the price-check MINI-GAME no longer reads as the site's answer to the query", () => {
  const title = /title: "([^"]+)"/.exec(read(GAME))?.[1] ?? "";
  assert.ok(title, "expected a title on the game page");
  assert.ok(/Game/.test(title), `the game's title must say so — got "${title}"`);
  // The specific failure being guarded: "Riftbound" and "price check" adjacent
  // in a game's title. Word order in the current title puts "Game" between them.
  assert.ok(
    !/riftbound[\s—-]+price check/i.test(title),
    `a game title must not carry the "riftbound price check" adjacency — got "${title}"`,
  );
});

test("/bulk-pricer keeps the BULK price-check query, and doesn't claim the single-card one", () => {
  // "Bulk Riftbound Card Price Checker" is a genuinely different job (many cards
  // at once, Premium-gated) and stays as it is — this asserts the split holds
  // rather than that the page changed.
  const src = read("src/app/bulk-pricer/page.tsx");
  assert.match(src, /const TITLE = "Bulk Riftbound Card Price Checker"/, "bulk pricer keeps its own title");
});

// ── The map itself ──────────────────────────────────────────────────────────

test("docs/seo-keyword-map.md records both owners, per its own rule 3", () => {
  const map = read(MAP);
  assert.match(map, /\| `riftbound card list` \(no set named\) \| `\/browse`/, "card-list row must name /browse");
  assert.match(map, /`riftbound price check`/, "price-check must have a row at all");
  // The stale claim this pass found and corrected. If it ever comes back, the
  // query silently loses its owner again.
  assert.ok(
    !/`\/guides\/riftbound-card-list` \(all-sets hub — \*\*not yet built/.test(map),
    "the stale 'not yet built, backlog item 12' claim must not return",
  );
});
