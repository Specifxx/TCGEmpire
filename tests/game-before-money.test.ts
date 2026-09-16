import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS, POPULAR_LINKS } from "../src/components/nav-groups";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// "Simply a too greedy/capitalistic/money focused site for a card GAME for me."
//
// Said more than once by the site's single most engaged feedback-giver, and the
// site's own structure was the evidence. Measured on production 2026-09-16,
// before this pass:
//
//   • /premium was the 2nd internal link on the page; the first game was the 34th
//   • `box-ev` (booster-box gambling EV) and `selling-fees` both outranked every
//     one of the ten playable things this site has
//   • the homepage ran FIVE consecutive price sections before anything playable
//   • "How RiftCompare works" was Search → Compare → Buy, full stop: the site's
//     own three-word story about itself ended at the till
//   • all eleven `popular` nav links — the phone Explore overlay's default view —
//     were prices, tools, Premium or the blog. Not one game.
//
// Prices stay the product. What this file pins is that the game is not an
// afterthought in the furniture around them, because every one of these is a
// one-line edit away from silently reverting.
// ─────────────────────────────────────────────────────────────────────────────

const titles = NAV_GROUPS.map((g) => g.title);
const at = (t: string) => {
  const i = titles.indexOf(t);
  assert.ok(i >= 0, `expected a "${t}" nav group, found: ${titles.join(", ")}`);
  return i;
};

test("Decks and Games outrank the money tools in the nav", () => {
  assert.ok(at("Decks") < at("Deals & value"), "building a deck should come before the deal finder");
  assert.ok(at("Games") < at("Deals & value"), "playing should come before the selling-fee calculator");
});

test("…but Prices still leads, because that IS the product", () => {
  assert.equal(titles[0], "Prices", "this pass rebalances the framing; it does not demote the thing people come for");
  assert.ok(at("Prices") < at("Games"));
});

test("the phone Explore overlay's default view offers something to play", () => {
  const hrefs = POPULAR_LINKS.map((l) => l.href);
  const playable = hrefs.filter((h) => h === "/riftle" || h.startsWith("/games"));
  assert.ok(playable.length >= 1, `no game in the default glance view: ${hrefs.join(", ")}`);
  // Deck building counts as playing too, and was already there — but a game
  // proper has to be present on its own, or this reverts to "tools only".
  assert.ok(hrefs.includes("/riftle"), "the free daily puzzle is the one to promote: no account, no purchase");
});

test("the homepage puts something playable above the commercial run", () => {
  const code = readCode("src/components/home/HomeSections.tsx");
  const play = code.indexOf("<ReturnVisitCards");
  const deals = code.indexOf("<TodaysTopDeals");
  const ebay = code.indexOf("<EbayPicks");
  assert.ok(play > 0 && deals > 0 && ebay > 0, "expected all three homepage sections to render");
  assert.ok(play < deals, "Riftle/pack-sim must not sit below Today's Top Deals again");
  assert.ok(play < ebay, "…nor below the eBay unit");
});

test("the site's story about itself no longer ends at the purchase", () => {
  const src = read("src/components/home/HowItWorks.tsx");
  const buy = src.indexOf("Buy for the best price");
  assert.ok(buy > 0, "step 3 should still be there — this adds to the story, it doesn't remove a step");
  assert.ok(src.indexOf("n: 4") > buy, "there must be a step AFTER buying");
  // …and that step has to actually go somewhere playable.
  for (const href of ["/deck", "/learn", "/riftle"]) {
    assert.ok(src.slice(buy).includes(href), `the final step must link to ${href}`);
  }
  assert.doesNotMatch(src, /in three steps/, "the count in the subheading has to keep up with the steps");
});

test("the binder page does not talk like a trading desk", () => {
  const src = read("src/app/portfolio/page.tsx");
  // Split off the header comment: it NAMES the old words to explain the change,
  // and a test that failed on its own rationale would be self-defeating.
  const body = src.slice(src.indexOf("function Delta"));
  for (const word of ["Profit & Loss", "Profit &amp; Loss", "Invested", '"Return"', "My portfolio"]) {
    assert.ok(!body.includes(word), `"${word}" is finance vocabulary for a shoebox of cardboard`);
  }
  // "holding" only as COPY. `portfolio.holdings` is the data field and renaming
  // it would be churn with no reader-visible effect — this bans the rendered
  // forms ("3 priced holdings", "holdings you've recorded") and nothing else.
  for (const rendered of [/priced holding/, /holding\{/, />\s*Holdings/, /holdings you/]) {
    assert.doesNotMatch(body, rendered, `"${rendered.source}" reads as a brokerage statement`);
  }
  for (const plain of ["You paid", "Worth now", "Up / down", "My binder"]) {
    assert.ok(body.includes(plain), `expected the plain-English label "${plain}"`);
  }
});

test("the rename costs nothing: the route is unchanged and the old word still finds it", () => {
  // /portfolio is noindex, so no SEO rides on the label — but bookmarks and
  // every existing internal link ride on the URL.
  const nav = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === "/portfolio");
  assert.ok(nav, "the route must stay /portfolio");
  assert.equal(nav.label, "My Binder");
  assert.ok(nav.keywords?.includes("portfolio"), "typing the old word must still land here in ⌘K");
  assert.match(read("src/app/portfolio/page.tsx"), /robots: \{ index: false/, "still a personal page, still noindex");
});

test("nothing was taken away to make room", () => {
  // The complaint was about proportion, not about the money features existing.
  // Removing them would be a different (and worse) change than the one asked for.
  const hrefs = NAV_GROUPS.flatMap((g) => g.links).map((l) => l.href);
  for (const kept of ["/tools/box-ev", "/tools/selling-fees", "/tools/deal-finder", "/premium", "/portfolio", "/market"]) {
    assert.ok(hrefs.includes(kept), `${kept} must still be reachable — this pass reorders, it does not delete`);
  }
});
