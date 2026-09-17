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

test("the homepage's hard-won title is NOT traded away for the new long-tail", () => {
  // Three documented audits (2026-08-20, 08-30, 09-10) converged on this exact
  // string, the last of them on live SERP evidence. A future pass reaching for
  // "price check" in the title would be swapping a proven head-term match for an
  // adjacent long-tail — the trade this test exists to refuse.
  assert.match(
    read(HOME),
    /title: \{ absolute: "Riftbound Card Prices \(US\) — Compare Every Store \| RiftCompare" \}/,
    "homepage title must still target 'Riftbound Card Prices' exactly",
  );
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
