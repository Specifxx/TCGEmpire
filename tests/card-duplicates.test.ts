import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDuplicateMap, identityKey, primaryOf, type CardIdentity } from "../src/lib/card-duplicates";

// ─────────────────────────────────────────────────────────────────────────────
// A deeper crawl (601 URLs, up from 451) found duplicate card rows: a past
// import created extra rows for three promo printings and gave each collision a
// numeric slug suffix. Identical name, set, collector number, rarity, variant and
// promo flag → byte-identical titles on several live URLs.
//
// These pin the consolidation rules. They are pure — no database — because the
// rules are what must not drift; the query around them is one findMany.
// ─────────────────────────────────────────────────────────────────────────────

const base: Omit<CardIdentity, "id" | "slug"> = {
  name: "Poppy, Defender of the Meek",
  setCode: "UNL",
  collectorNumber: "178/219",
  rarity: "Epic",
  variant: null,
  isPromo: true,
};

const card = (id: string, slug: string | null, over: Partial<CardIdentity> = {}): CardIdentity => ({
  ...base,
  id,
  slug,
  ...over,
});

// The real rows, verbatim.
const POPPY = [
  card("cmsaeekc300titw0lbxwgv77i", "poppy-defender-of-the-meek-unl-178-219-promo"),
  card("cmsaeekc300tjtw0ll346qp4k", "poppy-defender-of-the-meek-unl-178-219-promo-112"),
  card("cmsaeekc300tktw0lhmd08yli", "poppy-defender-of-the-meek-unl-178-219-promo-113"),
];

test("the unsuffixed slug is the canonical one", () => {
  assert.equal(primaryOf(POPPY).slug, "poppy-defender-of-the-meek-unl-178-219-promo");
});

test("the primary does not depend on the order rows come back in", () => {
  const orders = [POPPY, [...POPPY].reverse(), [POPPY[1], POPPY[2], POPPY[0]], [POPPY[2], POPPY[0], POPPY[1]]];
  for (const rows of orders) {
    assert.equal(primaryOf(rows).id, POPPY[0].id);
  }
});

test("THE REPORTED CLUSTER — both extras map to the original, the original maps to nothing", () => {
  const map = buildDuplicateMap(POPPY);
  assert.equal(map.size, 2);
  assert.equal(map.get(POPPY[1].id)?.slug, POPPY[0].slug);
  assert.equal(map.get(POPPY[2].id)?.slug, POPPY[0].slug);
  assert.equal(map.get(POPPY[0].id), undefined, "the canonical row must stay indexable");
});

test("a card with no twin is never marked a duplicate", () => {
  const map = buildDuplicateMap([card("solo", "vi-destructive-ogn-036a-298", { name: "Vi, Destructive" })]);
  assert.equal(map.size, 0);
});

test("different printings of the same card are NOT duplicates", () => {
  // These legitimately share a name and set. Every one of them is a distinct
  // printing with its own price, and every one must stay indexable.
  const printings = [
    card("p1", "vi-destructive-ogn-036-298", { variant: null, isPromo: false }),
    card("p2", "vi-destructive-ogn-036a-298", { variant: "a", isPromo: false }),
    card("p3", "vi-destructive-ogn-036s-298", { variant: "s", isPromo: false }),
    card("p4", "vi-destructive-ogn-036-298-promo", { variant: null, isPromo: true }),
    card("p5", "vi-destructive-ogn-036-298-showcase", { variant: null, isPromo: false, rarity: "Showcase" }),
    card("p6", "vi-destructive-ogn-037-298", { variant: null, isPromo: false, collectorNumber: "037/298" }),
  ];
  assert.equal(buildDuplicateMap(printings).size, 0);
});

test("each of the three real clusters consolidates to exactly one URL", () => {
  const catalogue: CardIdentity[] = [
    ...POPPY,
    card("b1", "blade-of-the-ruined-king-sfd-178-221-promo", {
      name: "Blade of the Ruined King",
      setCode: "SFD",
      collectorNumber: "178/221",
    }),
    card("b2", "blade-of-the-ruined-king-sfd-178-221-promo-84", {
      name: "Blade of the Ruined King",
      setCode: "SFD",
      collectorNumber: "178/221",
    }),
    card("m1", "miss-fortune-buccaneer-ogn-193-298-promo", {
      name: "Miss Fortune, Buccaneer",
      setCode: "OGN",
      collectorNumber: "193/298",
      rarity: "Rare",
    }),
    card("m2", "miss-fortune-buccaneer-ogn-193-298-promo-21", {
      name: "Miss Fortune, Buccaneer",
      setCode: "OGN",
      collectorNumber: "193/298",
      rarity: "Rare",
    }),
    // A normal, unduplicated card must be untouched.
    card("z1", "yasuo-windrider-ogn-205-298", { name: "Yasuo, Windrider", collectorNumber: "205/298", isPromo: false }),
  ];
  const map = buildDuplicateMap(catalogue);
  assert.equal(map.size, 4, "4 excess rows across 3 clusters");
  assert.equal(map.get("b2")?.id, "b1");
  assert.equal(map.get("m2")?.id, "m1");
  assert.equal(map.get("z1"), undefined);
  // No canonical is itself a duplicate — otherwise a canonical would point at a
  // noindexed URL, which is worse than the original problem.
  for (const twin of map.values()) assert.equal(map.has(twin.id), false);
});

test("identityKey ignores case and treats a null variant as no variant", () => {
  assert.equal(identityKey(base), identityKey({ ...base, name: base.name.toUpperCase() }));
  assert.equal(identityKey(base), identityKey({ ...base, variant: null }));
  assert.notEqual(identityKey(base), identityKey({ ...base, variant: "a" }));
  assert.notEqual(identityKey(base), identityKey({ ...base, isPromo: false }));
  assert.notEqual(identityKey(base), identityKey({ ...base, rarity: "Showcase" }));
});

test("identityKey cannot be fooled by a field boundary", () => {
  // Joined on "|" precisely so "UNL" + "178/219" can never collide with a card
  // named "…UNL" in a set numbered "178/219…".
  assert.notEqual(
    identityKey({ ...base, setCode: "UN", collectorNumber: "L178/219" }),
    identityKey({ ...base, setCode: "UNL", collectorNumber: "178/219" }),
  );
});

test("a null slug falls back to the id and never crashes", () => {
  const rows = [card("zzzzid", null), card("aid", null)];
  assert.equal(primaryOf(rows).id, "aid", "shortest, then lexical");
  assert.equal(buildDuplicateMap(rows).get("zzzzid")?.id, "aid");
});
