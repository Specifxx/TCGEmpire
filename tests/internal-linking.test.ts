import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { KEYWORDS } from "../src/lib/keywords";
import { getArticles } from "../src/lib/articles";
import { guidesForCard, mechanicGuideForCard, type CardForGuides } from "../src/lib/content/related-guides";
import { NAV_GROUPS, FOOTER_GROUPS } from "../src/components/nav-groups";

// ─────────────────────────────────────────────────────────────────────────────
// Internal linking into the editorial content (GROWTH-AUDIT.md § 2).
//
// Two defects, both invisible to every existing check because neither is an
// error on any individual page:
//
//   1. /learn was an ORPHAN. 359 lines of interactive new-player content,
//      sitemap priority 0.8, and zero inbound internal links from any of 1,698
//      pages — the only thing referencing it was the mega-menu, which renders
//      client-side and so does not exist for the crawler deciding whether the
//      page is worth indexing.
//   2. No card page linked to the three Vendetta mechanic guides, which are
//      Vendetta-specific and are the site's best-performing editorial.
//
// Source-level and data-level, so this runs in `npm test` with no server and no
// database and can gate a PR.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── /learn must stay reachable from the server-rendered homepage ─────────────
//
// This used to assert the /learn link lived IN the hero (src/components/home/
// CinematicHero.tsx). The homepage-redesign brief explicitly moved it out —
// "Delete from the hero: ... the 'New to Riftbound? Learn how to play →'
// link" — on the reasoning that the hero should carry exactly one secondary
// text link ("Browse all N cards →") and nothing else competing with the
// search box. That's a deliberate, brief-mandated change, not a regression,
// but the underlying concern these tests exist to guard — /learn must not go
// back to being an orphan — is still real and still needs a pin.
//
// Since the hero stopped carrying it, the fix is the SAME mechanism every
// other section this rebuild moved off the homepage now relies on: a real,
// server-rendered link in nav-groups.ts → FOOTER_GROUPS → FooterNav.tsx,
// which layout.tsx renders on every route (including "/") with no client-only
// gating. That is a strictly more robust fix than a single hero link ever
// was — it's sitewide, not homepage-only — so these tests now pin THAT
// mechanism instead of grepping a specific component for one specific href.

test("/learn has a real, non-hidden entry in the shared nav data", () => {
  const entry = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === "/learn");
  assert.ok(entry, "nav-groups.ts must carry a /learn entry point");
  assert.ok(!entry!.hideInFooter, "/learn must not be hidden from the footer — it's the homepage's only remaining path to it");
});

test("/learn's footer entry point is descriptive, not a bare 'click here'", () => {
  const entry = NAV_GROUPS.flatMap((g) => g.links).find((l) => l.href === "/learn");
  assert.ok(entry, "nav-groups.ts must carry a /learn entry point");
  assert.ok(entry!.label.length > 4, `label is too short to be descriptive: ${JSON.stringify(entry!.label)}`);
  assert.match(entry!.label, /riftbound|learn|play/i, `label should say what the page is: ${JSON.stringify(entry!.label)}`);
});

test("/learn's group actually reaches FOOTER_GROUPS (not launcher-only)", () => {
  const inFooter = FOOTER_GROUPS.some((g) => g.links.some((l) => l.href === "/learn"));
  assert.ok(inFooter, "/learn's nav group must be one of the groups spread into FOOTER_GROUPS");
});

test("FooterNav renders FOOTER_GROUPS as real anchors, not JS-only navigation", () => {
  const footerNav = read("src/components/FooterNav.tsx");
  assert.ok(!footerNav.startsWith('"use client"'), "FooterNav must stay a server component so its links exist in the raw server HTML");
  assert.ok(/<Link[\s\S]*?href=\{l\.href\}/.test(footerNav), "footer links must render as real <Link href> anchors");
  assert.ok(!/onClick=\{\(\) => (router|window\.location)/.test(footerNav), "no JS-only navigation in the footer");
});

test("the footer renders on every route, including the homepage", () => {
  const layout = read("src/app/layout.tsx");
  // FooterNav must be unconditional in the root layout — no `{pathname ===
  // "/" ? null : <FooterNav />}`-style gate that would silently re-orphan
  // /learn (and everything else the redesign moved out of the homepage body)
  // on the one route that most needs it reachable.
  const call = /<FooterNav\s*\/>/.exec(layout);
  assert.ok(call, "layout.tsx must render <FooterNav /> unconditionally");
});

test("the hero carries exactly one secondary text link, not a wall of CTAs", () => {
  // Rebuilt per the homepage-redesign brief: the hero's old CTA row (up to
  // four competing calls to action across earlier iterations) is now exactly
  // one plain-text link ("Browse all N cards →") below the search box, plus
  // the quiet region toggle (a control, not a CTA, and not a <Link>). This
  // pins that a future edit can't quietly re-crowd the hero.
  const hero = read("src/components/home/CinematicHero.tsx");
  const links = hero.match(/<Link\b/g) ?? [];
  assert.equal(links.length, 1, `the hero has ${links.length} <Link> elements; the brief calls for exactly one`);
  assert.ok(hero.includes('href="/browse"'), "the hero's one remaining link should point at the database, not somewhere new");
  // Scoped to an actual className attribute value, not the raw file text — the
  // hero's own doc comments are allowed to reference the class name in prose
  // (e.g. explaining that it deliberately ISN'T applied here) without tripping
  // this check.
  assert.ok(!/className="[^"]*btn-primary/.test(hero), "the hero's secondary link must not be styled as a filled button — that's a second CTA in disguise");
});

// ── Card → mechanic guide ────────────────────────────────────────────────────

const VEN_BASE: CardForGuides = {
  setName: "Vendetta", setCode: "VEN", rarity: "Rare", type: "Unit", domain: "Chaos",
  isPromo: false, variant: null, isSignature: false, priceCents: 500,
};

test("a card printing a keyword resolves to that keyword's own guide", () => {
  for (const k of KEYWORDS) {
    const card = { ...VEN_BASE, setCode: k.set, description: `Some text. ${k.rulesContain} more text.` };
    const g = mechanicGuideForCard(card);
    assert.ok(g, `a card printing ${k.rulesContain} must resolve a guide`);
    assert.equal(g!.slug, k.guideSlug, `${k.name} must resolve to its own guide`);
    assert.equal(g!.name, k.name);
  }
});

test("the mechanic rule never fires without the printed marker", () => {
  // The whole point: this is a match on rules text the card ACTUALLY carries,
  // not an inference from the set. A Vendetta card with no keyword gets nothing.
  assert.equal(mechanicGuideForCard({ ...VEN_BASE, description: "Deal 2 damage to a unit." }), null);
  assert.equal(mechanicGuideForCard({ ...VEN_BASE, description: null }), null);
  assert.equal(mechanicGuideForCard({ ...VEN_BASE, description: "" }), null);
  assert.equal(mechanicGuideForCard(VEN_BASE), null, "an absent description must not throw or guess");
});

test("keyword matching is scoped to the set that introduced it", () => {
  // Empower/Flow/Burn are Vendetta keywords. An older card whose text happens to
  // contain the word must not be sold a guide about a mechanic it doesn't have.
  for (const k of KEYWORDS) {
    const wrongSet = { ...VEN_BASE, setCode: "OGN", setName: "Origins", description: `${k.rulesContain} me.` };
    assert.equal(mechanicGuideForCard(wrongSet), null, `${k.name} must not match outside ${k.set}`);
  }
});

test("guidesForCard surfaces the mechanic guide first, without crowding out the rest", () => {
  for (const k of KEYWORDS) {
    const card = { ...VEN_BASE, setCode: k.set, description: `${k.rulesContain} me.` };
    const guides = guidesForCard(card);
    assert.equal(guides[0]?.slug, k.guideSlug, `${k.name}: the mechanic guide should lead`);
    assert.equal(guides.length, 3, "the card page still gets its full complement of three links");
    assert.equal(new Set(guides.map((g) => g.slug)).size, 3, "no duplicate links");
    assert.ok(guides[0].reason.includes(k.name), "the supporting line must name the mechanic");
  }
});

test("cards that never printed a keyword are unaffected", () => {
  // Guards the regression risk of inserting a rule high in the list: everything
  // that used to work must still work.
  const signature: CardForGuides = {
    setName: "Origins", setCode: "OGN", rarity: "Epic", type: "Unit", domain: "Fury",
    isPromo: false, variant: "alt", isSignature: true, priceCents: 12000, description: null,
  };
  const slugs = guidesForCard(signature).map((g) => g.slug);
  assert.ok(slugs.includes("riftbound-variant-glossary"), "a Signature print still reaches the variant glossary");
  assert.ok(slugs.includes("understanding-riftbound-card-rarity"), "…and the rarity guide");
  assert.equal(guidesForCard({ ...VEN_BASE, description: "Deal 2 damage." }).length, 3);
});

test("every guide the mechanic rule can return actually exists", () => {
  // KEYWORDS.guideSlug is a cross-file reference; a renamed article would send
  // 1,400 card pages at a 404 without this.
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  for (const k of KEYWORDS) {
    const a = bySlug.get(k.guideSlug);
    assert.ok(a, `${k.name}'s guideSlug "${k.guideSlug}" does not resolve to an article`);
    assert.equal(a!.category, "guide", `${k.guideSlug} must live under /guides for the card link to resolve`);
  }
});

test("the card page passes the printed rules text through", () => {
  // The rule is inert without it, and the failure is silent — every card simply
  // stops matching and nobody notices.
  const page = read("src/app/card/[id]/page.tsx");
  const call = /guidesForCard\(\{[\s\S]*?\}\)/.exec(page)?.[0] ?? "";
  assert.ok(call, "card page must call guidesForCard");
  assert.match(call, /description: card\.description/, "guidesForCard must receive the card's rules text");
});
