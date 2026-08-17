import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PACK_SLOTS,
  PULL_RATES,
  PACK_SOURCE,
  CARDS_PER_PACK,
  PACKS_PER_BOX,
  EPIC_UPGRADE_PER_RARE_SLOT,
  FOIL_UPGRADE_CHANCE,
} from "../src/lib/pack-composition";
import { DEFAULT_BASE_RATES } from "../src/lib/box-ev";
import { NAV_GROUPS, FOOTER_GROUPS } from "../src/components/nav-groups";

// ─────────────────────────────────────────────────────────────────────────────
// What is in a Riftbound booster pack — and why this file exists.
// ─────────────────────────────────────────────────────────────────────────────
// The site modelled a pack in TWO places and they disagreed. lib/box-ev.ts had
// Riot's real numbers, sourced. The pack-opening simulator had its own invented
// deal — eight commons, three uncommons, one rare, and a "hit" slot rolling
// 8% / 22% / 70% — while the page told visitors it used "the same odds by rarity
// as a physical pack". Three of those numbers are wrong and none had a source.
//
// The rates now live in one file with their citation. These tests pin them to
// Riot's published breakdown and, most importantly, to each other.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a pack is Riot's published 14 cards, slot for slot", () => {
  // "Collectability in Riftbound: Origins": 7 common, 3 uncommon, 2 rare-or-
  // better, 1 foil, 1 token/rune. Independently corroborated by the "14 Cards
  // Ea" printed on retail booster displays.
  const bySlot = Object.fromEntries(PACK_SLOTS.map((s) => [s.key, s.count]));
  assert.equal(bySlot.common, 7);
  assert.equal(bySlot.uncommon, 3);
  assert.equal(bySlot.rare, 2);
  assert.equal(bySlot.foil, 1);
  assert.equal(bySlot.rune, 1);
  assert.equal(CARDS_PER_PACK, 14);
  assert.equal(PACKS_PER_BOX, 24);
});

test("the simulator and the box-EV calculator model the same pack", () => {
  // THE DRIFT THIS FILE EXISTS FOR. box-ev's DEFAULT_BASE_RATES are expected
  // cards per pack; for the three fixed slots that is just the slot count, and
  // the two must agree or the site is quoting two different packs on two pages
  // that link to each other.
  const bySlot = Object.fromEntries(PACK_SLOTS.map((s) => [s.key, s.count]));
  assert.equal(DEFAULT_BASE_RATES.Common, bySlot.common, "box-ev and pack-composition disagree on commons");
  assert.equal(DEFAULT_BASE_RATES.Uncommon, bySlot.uncommon, "…on uncommons");
  assert.equal(DEFAULT_BASE_RATES.Rare, bySlot.rare, "…on rare-or-better slots");
});

test("the Epic upgrade reproduces Riot's ≈1 in 4 packs", () => {
  // Riot states the frequency but not the per-slot mechanic. Whatever model the
  // simulator uses, the expected Epics per pack has to come back to their number
  // — otherwise the published table and the thing dealing cards contradict.
  const expectedEpicsPerPack = EPIC_UPGRADE_PER_RARE_SLOT * (PACK_SLOTS.find((s) => s.key === "rare")?.count ?? 0);
  assert.ok(
    Math.abs(expectedEpicsPerPack - 0.25) < 1e-9,
    `model yields ${expectedEpicsPerPack} Epics/pack, Riot says ~0.25 (1 in 4)`
  );
  // And it must leave the double-Epic pack Riot says is possible: a model that
  // upgrades exactly one slot could never produce two.
  assert.ok(EPIC_UPGRADE_PER_RARE_SLOT > 0 && EPIC_UPGRADE_PER_RARE_SLOT < 1);
});

test("every published rate is sourced, and inferences are not dressed up as published", () => {
  for (const r of PULL_RATES) {
    assert.ok(r.sourced, `${r.label} is on the published table without a source`);
    assert.ok(r.frequency.trim(), `${r.label} has no stated frequency`);
  }
  // The two inferences stay out of the published table and stay honest.
  assert.ok(FOIL_UPGRADE_CHANCE > 0 && FOIL_UPGRADE_CHANCE < 0.5, "the foil slot is 'most of the time' a common/uncommon");
  const src = read("src/lib/pack-composition.ts");
  assert.match(src, /INFERRED|inference/i, "the inferred numbers must be labelled as such in the file");
  assert.ok(PACK_SOURCE.url.startsWith("https://playriftbound.com/"), "the citation must be Riot's own post");
});

test("per-box rates convert at the real box size", () => {
  const byKey = Object.fromEntries(PULL_RATES.map((r) => [r.key, r]));
  // ~2 per box → 1 per 12 packs; ~1 per 3 boxes → 1 per 72; ~1 in 10 of those → 1 per 720.
  assert.equal(byKey.altart.onePerPacks, PACKS_PER_BOX / 2);
  assert.equal(byKey.overnumbered.onePerPacks, PACKS_PER_BOX * 3);
  assert.equal(byKey.signature.onePerPacks, PACKS_PER_BOX * 3 * 10);
});

test("the simulator deals from the shared composition, not its own numbers", () => {
  // The specific regression: literal slot counts inlined in the route. If a
  // number is typed here again, this fails and points at the right file.
  const route = read("src/app/api/games/pack/route.ts");
  assert.match(route, /from "@\/lib\/pack-composition"/, "the pack route must read the sourced composition");
  assert.doesNotMatch(route, /sampleDistinct\(commons,\s*\d/, "slot counts must come from PACK_SLOTS, not a literal");
  assert.doesNotMatch(route, /sampleDistinct\(uncommons,\s*\d/, "slot counts must come from PACK_SLOTS, not a literal");
});

test("the pack simulator page carries the content that makes it rankable", () => {
  // A simulator is a client-side toy — a crawler sees an empty div. What ranks is
  // the sourced tables, the FAQ and the structured data around it. This is the
  // page's whole SEO thesis, so it is worth asserting rather than assuming.
  const page = read("src/app/games/pack-sim/page.tsx");
  assert.match(page, /faqPage\(/, "needs FAQPage JSON-LD");
  assert.match(page, /"WebApplication"/, "needs WebApplication JSON-LD, as /tools/box-ev has");
  // Breadcrumb JSON-LD comes from <Breadcrumbs>, which emits it alongside the
  // trail it renders. The page must NOT hand-write a second BreadcrumbList —
  // that is what it did, describing the same hierarchy twice in one document.
  assert.match(page, /<Breadcrumbs\s/, "needs a breadcrumb trail");
  assert.doesNotMatch(page, /"@type": "BreadcrumbList"|"BreadcrumbList"/, "duplicate BreadcrumbList — <Breadcrumbs> already emits one");
  assert.match(page, /PACK_SLOTS/, "must render the pack-composition table");
  assert.match(page, /PULL_RATES/, "must render the pull-rate table");
  assert.match(page, /PACK_SOURCE/, "must cite the source on the page, not just in code");
  // Exactly one <h1>: GameShell renders its own unless the page opts out.
  assert.match(
    read("src/components/games/PackSim.tsx"),
    /chrome=\{false\}/,
    "PackSim must opt out of GameShell's heading, or the page has two <h1>s"
  );
});

test("the simulator defaults to the current set, not the oldest", () => {
  const page = read("src/app/games/pack-sim/page.tsx");
  // The picker's first entry is the default, and SETS is in release order — so
  // sorting by releasedOn descending is what puts Vendetta (and, from 23 Oct
  // 2026, Radiance) in front instead of Origins.
  assert.match(page, /releasedOn \?\? ""\)\.localeCompare/, "sets must be ordered newest-first");
  assert.match(
    read("src/app/api/games/pack/route.ts"),
    /releasedOn \?\? ""\)\.localeCompare/,
    "the API's fallback must prefer the newest set too, or it disagrees with the picker"
  );
});

test("the pack simulator is in the sitemap, rated as a tool rather than a mini-game", () => {
  const src = read("src/lib/sitemap-sections.ts");
  const line = src.split("\n").find((l) => l.includes("/games/pack-sim"));
  assert.ok(line, "/games/pack-sim must be in the sitemap");
  assert.match(line!, /priority: 0\.8/, "it targets a head term and carries real content — not 0.6");
});

test("the pack simulator is reachable from the homepage", () => {
  // The incumbent at #1 has no indexable content at all, so internal signals are
  // the cheapest lever available. A homepage link is the strongest one.
  //
  // This used to assert the link lived IN ReturnVisitCards, one of the
  // homepage's own "come back tomorrow" hooks (src/components/home/
  // ReturnVisitCards.tsx), rendered directly from src/app/page.tsx. The
  // homepage-redesign brief explicitly removes that whole section — "Pack
  // opening simulator | own page — footer + nav" in its "what moves, and
  // where" table — on the reasoning that a "one job" homepage doesn't need
  // its own dedicated return-visit hooks when the same destinations are
  // already one click away sitewide. That's a deliberate, brief-mandated
  // change, not a regression, but the underlying SEO concern this test
  // exists to guard — the homepage must still link to /games/pack-sim
  // somewhere real — is still real and still needs a pin.
  //
  // The old assertion only ever grepped ReturnVisitCards.tsx's OWN source,
  // never page.tsx itself, so it would have kept passing even after the
  // component stopped being mounted on the homepage at all — a silent,
  // vacuous pass. Fixed the same way tests/internal-linking.test.ts already
  // fixed the equivalent /learn case: pin the real, sitewide mechanism
  // instead — a real, non-hidden nav-groups.ts entry that reaches
  // FOOTER_GROUPS, which layout.tsx renders unconditionally on every route
  // including "/" (see FooterNav.tsx — a plain server component, real
  // <Link href> anchors, no client-only gating). That's strictly more
  // robust than a single homepage-body link ever was.
  const entry = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === "/games/pack-sim");
  assert.ok(entry, "nav-groups.ts must carry a /games/pack-sim entry point");
  assert.ok(!entry!.hideInFooter, "/games/pack-sim must not be hidden from the footer — it's the homepage's only remaining path to it");
  const inFooter = FOOTER_GROUPS.some((g) => g.links.some((l) => l.href === "/games/pack-sim"));
  assert.ok(inFooter, "/games/pack-sim's nav group must be one of the groups spread into FOOTER_GROUPS");
});

// ── The three claims the page makes that the simulator has to honour ─────────
// Each of these shipped as a live falsehood: the page published four Riot rates
// while the code implemented one, promised no repeats while three slots drew
// independently, and asserted 14 cards while silently dealing 13.

test("the chase tiers the page publishes are actually reachable in the deal", () => {
  const route = read("src/app/api/games/pack/route.ts");
  // Comments stripped first: this file EXPLAINS the `variant: null` filter it
  // removed, so matching raw source would fail on its own documentation.
  const code = route.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // The pool query must NOT filter out alt-arts. scripts/fix-altart-rarity.ts
  // rewrites every `variant != null` row to rarity "Showcase", so a
  // `variant: null` filter removed every alt-art from the pool — and the
  // over-numbered and signature prints that survived landed in a "Showcase"
  // bucket no fallback chain reached. Three of four published rates were dead.
  assert.doesNotMatch(code, /variant:\s*null/, "a variant:null filter makes every chase rate unreachable");
  assert.match(route, /poolOf/, "pools must be classified by poolOf(), not by the overwritten rarity column");
  for (const pool of ["AltArt", "Overnumbered", "Signature"]) {
    assert.ok(route.includes(pool), `${pool} must be reachable in the deal — it is on the published table`);
  }
});

test("every published rate that the deal rolls uses the published number", () => {
  // The rates come from PULL_RATES rather than being retyped, so the table on
  // the page and the code dealing cards cannot say different things.
  const route = read("src/app/api/games/pack/route.ts");
  assert.match(route, /PULL_RATES/, "chase rolls must read the published rates");
  assert.doesNotMatch(route, /0\.0139|1\s*\/\s*72\b|1\s*\/\s*720\b/, "rates must not be re-derived by hand");
});

test("no card can appear twice in one pack", () => {
  // sampleDistinct dedupes within ONE pool. The Epic upgrade, the foil slot and
  // the rune were separate uniform draws over overlapping pools, so a pack could
  // (and did) repeat a card while the page promised it could not.
  const route = read("src/app/api/games/pack/route.ts");
  assert.match(route, /const used = new Set<string>\(\)/, "the deal needs one global used-card set");
  assert.match(route, /!used\.has\(c\.id\)/, "every draw must exclude cards already dealt");
  assert.match(read("src/app/games/pack-sim/page.tsx"), /no card appears twice/, "the page states this — keep them together");
});

test("runes are dealt only from the rune slot, and a short pack says so", () => {
  const route = read("src/app/api/games/pack/route.ts");
  // Runes carry an ordinary rarity, so leaving them in the base pools let the
  // same rune be dealt twice — once as a common, once in its own slot.
  assert.match(route, /runeIds/, "runes must be excluded from the base rarity pools");
  // A set with no runes catalogued yields 13 cards, not the 14 the page
  // promises. That is allowed, but it must be reported rather than hidden.
  assert.match(route, /runeSlotDealt/, "a 13-card pack must be flagged in the response");
});

test("no keywords meta — the site banned it, and this page had reintroduced it", () => {
  // app/layout.tsx: "NO `keywords` meta. Google has ignored it since 2009 and
  // Bing treats stuffing it as a negative signal; it only ever advertised our
  // target terms to competitors. Removed site-wide."
  assert.doesNotMatch(read("src/app/games/pack-sim/page.tsx"), /^\s*keywords:/m);
});

test("the WebApplication node is wired into the site's entity graph", () => {
  const page = read("src/app/games/pack-sim/page.tsx");
  assert.match(page, /"@id": `\$\{SITE_URL\}\/games\/pack-sim#app`/, "the node needs an @id");
  assert.match(page, /isPartOf: \{ "@id": `\$\{SITE_URL\}\/#website` \}/);
  assert.match(page, /publisher: \{ "@id": `\$\{SITE_URL\}\/#org` \}/);
});
