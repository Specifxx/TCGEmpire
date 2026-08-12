import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { KEYWORDS } from "../src/lib/keywords";
import { getArticles } from "../src/lib/articles";
import { guidesForCard, mechanicGuideForCard, type CardForGuides } from "../src/lib/content/related-guides";

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

test("the homepage hero links to /learn in the server HTML", () => {
  const hero = read("src/components/home/CinematicHero.tsx");
  assert.ok(hero.includes('href="/learn"'), "the hero must carry a /learn entry point");
  // A <Link> renders a real <a href>; a router.push in an onClick does not, and
  // is invisible to a crawler — which is exactly how /learn became an orphan.
  assert.ok(
    /<Link\s+[^>]*href="\/learn"|href="\/learn"[\s\S]{0,200}?>/.test(hero),
    "/learn must be a real anchor, not JS-only navigation",
  );
  assert.ok(!/onClick=\{\(\) => (router|window\.location)/.test(hero), "no JS-only navigation in the hero");
});

test("the /learn link is descriptive, not a bare 'click here'", () => {
  const hero = read("src/components/home/CinematicHero.tsx");
  const anchor = /href="\/learn"[\s\S]{0,400}?>([\s\S]*?)<\/Link>/.exec(hero)?.[1] ?? "";
  const text = anchor.replace(/\{[^}]*\}/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  assert.ok(text.length > 12, `anchor text is too short to be descriptive: ${JSON.stringify(text)}`);
  assert.match(text, /riftbound|learn|play/i, `anchor text should say what the page is: ${JSON.stringify(text)}`);
});

test("the hero does not become a wall of competing CTAs", () => {
  // The CTA row was cut from four competing calls to action to two on purpose.
  // The /learn entry point is deliberately a quieter, separate line — this pins
  // that intent so the next addition has to think about it too.
  const hero = read("src/components/home/CinematicHero.tsx");
  const row = /flex flex-wrap items-center justify-center gap-x-4[\s\S]*?<\/div>/.exec(hero)?.[0] ?? "";
  const ctas = (row.match(/<Link/g) ?? []).length;
  assert.ok(ctas <= 2, `the primary CTA row has ${ctas} links; keep it at two`);
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
