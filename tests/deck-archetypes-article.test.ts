import test from "node:test";
import assert from "node:assert/strict";

import { getArticle } from "../src/lib/articles";
import { META_DECKS } from "../src/lib/meta-decks";
import { ARCHETYPE_GROUPS, seedsInGroup, archetypeParts } from "../src/lib/deck-groups";

// ─────────────────────────────────────────────────────────────────────────────
// /guides/riftbound-deck-archetypes-guide.
//
// Every count, tier, exemplar deck and domain list in this article is read off
// prisma/meta-decks.json through the SAME lib/deck-groups.ts matching function
// the live /decks/archetype/* pages use — not retyped by hand. The central claim
// ("every one of the real decks is fundamentally Aggro, Tempo or Midrange; the
// other six labels are always a tag on top of one of those three") is an
// empirical fact about the current metagame, not a rule of the game — and it is
// exactly the kind of fact that goes quietly false the next time the meta is
// re-cut. These tests re-derive it (and the comparison table's per-row figures)
// from the data, so a re-cut fails this file loudly instead of leaving a
// confident, checkable falsehood live on an indexed page.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = "riftbound-deck-archetypes-guide";
const article = getArticle(SLUG);
const PILLARS = ["aggro", "tempo", "midrange"];

const text = () => {
  const a = article!;
  return [a.body, a.excerpt, ...(a.summary ?? []), ...(a.faq ?? []).flatMap((f) => [f.q, f.a])].join("\n");
};

test("the article exists, is published, and is a guide", () => {
  assert.ok(article, `${SLUG} must exist`);
  assert.ok(!article!.draft, "it is published, so the counts below are live claims");
  assert.equal(article!.category, "guide", "category decides the URL — /guides/, not /blog/");
});

test("all nine archetype groups it names are the site's real, canonical taxonomy", () => {
  // If a group is ever renamed or a new one added in lib/deck-groups.ts, the
  // article's table and its ItemList must both still name exactly that set —
  // inventing or dropping an archetype here would silently disagree with the
  // /decks/archetype/* pages the article links to.
  const realSlugs = ARCHETYPE_GROUPS.map((g) => g.slug).sort();
  assert.equal(realSlugs.length, 9, "the article's '9 named archetypes' claim assumes exactly 9 groups exist");

  const tableLinks = [...article!.body.matchAll(/\/decks\/archetype\/([a-z]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(tableLinks)].sort(), realSlugs, "the body must link every real archetype group, and no others");

  const itemListSlugs = (article!.itemList?.items ?? []).map((i) => i.url?.split("/").pop()).sort();
  assert.deepEqual(itemListSlugs, realSlugs, "the ItemList must match the same set the visible table names");
});

test("every real deck is fundamentally Aggro, Tempo or Midrange — the article's central claim", () => {
  for (const deck of META_DECKS) {
    const parts = archetypeParts(deck.archetype);
    const touchesPillar = parts.some((p) => PILLARS.some((pillar) => new RegExp(`(^|\\s)${pillar}(\\s|$)`).test(p)));
    assert.ok(
      touchesPillar,
      `${deck.name} ("${deck.archetype}") touches none of Aggro/Tempo/Midrange — the article's "every deck is fundamentally one of the big three" claim is now false`,
    );
  }
});

test("the pillar deck counts (Aggro/Tempo/Midrange) match what the summary and table state", () => {
  const counts = Object.fromEntries(
    ARCHETYPE_GROUPS.filter((g) => PILLARS.includes(g.slug)).map((g) => [g.slug, seedsInGroup(g).length]),
  );
  // Stated in the summary as "Aggro and Tempo... 4 of the 10... each; Midrange has 3."
  assert.match(text(), new RegExp(`${counts.aggro} of the 10 tracked decks each`), `aggro count drifted to ${counts.aggro}`);
  assert.match(text(), new RegExp(`Midrange has ${counts.midrange}`), `midrange count drifted to ${counts.midrange}`);
  assert.equal(counts.aggro, counts.tempo, "the summary claims Aggro and Tempo are TIED — re-check if a re-cut breaks the tie");
});

test("total tracked-deck count matches META_DECKS", () => {
  assert.match(text(), new RegExp(`\\b${META_DECKS.length}\\b`), `META_DECKS now has ${META_DECKS.length} decks — the article's "10" claims need updating`);
});

test("exactly one Tier 1 deck, and it's named correctly as Tempo", () => {
  const tier1 = META_DECKS.filter((d) => d.tier === "1");
  assert.equal(tier1.length, 1, "the article claims a single Tier 1 deck — the current metagame no longer has exactly one");
  const deck = tier1[0];
  assert.ok(archetypeParts(deck.archetype).includes("tempo"), `the sole Tier 1 deck (${deck.name}) is no longer Tempo`);
  assert.match(article!.body, new RegExp(deck.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the Tier 1 exemplar's name must appear in the body");
});

test("every archetype row's exemplar deck and domain list are real and current", () => {
  const rows = [...article!.body.matchAll(/\| \*\*\[([A-Za-z]+)\]\(\/decks\/archetype\/([a-z]+)\)\*\* \| [^|]+ \| ([^|]+) \| ([^|]+) \|/g)];
  assert.equal(rows.length, 9, "expected exactly 9 comparison-table rows, one per archetype group");

  for (const [, , slug, exemplarCell, domainCell] of rows) {
    const group = ARCHETYPE_GROUPS.find((g) => g.slug === slug);
    assert.ok(group, `unknown archetype group "${slug}" in the table`);
    const members = seedsInGroup(group!);
    assert.ok(members.length > 0, `${slug} has no real decks — the table row has nothing to cite`);

    // The exemplar cell names a real deck currently in this group, and it must
    // be the group's own best-tier member (seedsInGroup's own tier-then-metashare
    // order) — showcasing a weaker deck when a stronger one exists in the same
    // group would understate how the archetype is actually performing.
    const named = members.find((m) => exemplarCell.includes(m.name));
    assert.ok(named, `${slug}'s exemplar cell ("${exemplarCell.trim()}") does not name any real deck in that group`);
    assert.equal(named!.name, members[0].name, `${slug}'s exemplar should be the group's own top-tier deck (${members[0].name}), not ${named!.name}`);

    // The domain cell is exactly the group's real, alphabetised domain set.
    const realDomains = [...new Set(members.flatMap((m) => m.domains))].sort();
    const claimedDomains = domainCell.split(",").map((s) => s.trim());
    assert.deepEqual(claimedDomains, realDomains, `${slug}'s domain list has drifted from the real decks (now ${realDomains.join(", ")})`);
  }
});

test("Colorless is correctly excluded from the domain links — its hub page 404s", () => {
  // /decks/domain/colorless has zero real decks (seedsInGroup would be empty),
  // so linking it would point at a page with nothing on it. The article must
  // name Colorless in prose only, never as a /decks/domain/colorless link.
  const colorlessGroup = ARCHETYPE_GROUPS.find((g) => g.slug === "colorless");
  assert.ok(!colorlessGroup, "Colorless is not an archetype group, only a domain — sanity-checking the test's own assumption");
  assert.ok(!article!.body.includes("/decks/domain/colorless"), "must never link the Colorless domain hub — it has no real decks");
  for (const dom of ["fury", "calm", "mind", "body", "chaos", "order"]) {
    assert.ok(article!.body.includes(`/decks/domain/${dom}`), `must link the real, live ${dom} domain hub`);
  }
});

// Prose spells out a number this small ("span six of them") rather than using
// the digit — matching this article's own voice elsewhere ("Nine named
// archetypes"). The test has to accept either form so it checks the real claim
// instead of an incidental typographic choice.
const NUMBER_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" };

test("distinct-domain count (\"six of Riftbound's seven domains\") matches the real spread", () => {
  const seen = new Set(META_DECKS.flatMap((d) => d.domains.map((x) => x.toLowerCase())));
  const n = seen.size;
  const word = NUMBER_WORDS[n] ?? String(n);
  assert.match(
    text(),
    new RegExp(`span (${n}|${word}) of them`, "i"),
    `the real current decks now span ${n} domains, not what the article states`,
  );
  assert.ok(!seen.has("colorless"), "no real deck should be domain-paired as Colorless — sanity check");
});

test("internal links reinforce /decks — the site's actual target for the bare \"riftbound deck\" query", () => {
  // The whole reason this guide exists rather than re-targeting /decks' own
  // keyword: docs/seo-keyword-map.md already assigns "riftbound deck(s)" to
  // /decks. This piece is deliberately scoped to the adjacent "which archetype"
  // query and must funnel authority back to /decks, not compete with it.
  assert.equal(article!.browseCta?.href, "/decks", "the CTA must point at the real meta-decks page");
  const decksLinks = [...article!.body.matchAll(/\]\(\/decks\)/g)];
  assert.ok(decksLinks.length >= 2, "the body should link /decks more than once — it's the funnel target");
  assert.ok(!/^# .*riftbound deck(s)?$/im.test(article!.title), "the title must not exact-match \"riftbound deck(s)\" and compete with /decks");
});

test("the generated hero exists and its motif states the real archetype count", () => {
  assert.equal(article!.hero?.src, "/blog/riftbound-deck-archetypes-guide.png");
  const heroes = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "scripts", "gen-blog-heroes.ts"),
    "utf8",
  );
  const entry = /slug: "riftbound-deck-archetypes-guide"[\s\S]*?\n  \},/.exec(heroes);
  assert.ok(entry, "expected a HEROES entry for this slug");
  const items = [...entry![0].matchAll(/text: "([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.equal(items.length, ARCHETYPE_GROUPS.length, "the hero's grid tile count must match the real number of archetypes");
  assert.deepEqual(items.map((s) => s.toLowerCase()).sort(), ARCHETYPE_GROUPS.map((g) => g.slug).sort());
});
