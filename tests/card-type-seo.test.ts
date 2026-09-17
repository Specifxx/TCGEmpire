import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cardTitle, cardMetaDescription, titleFits, TITLE_MAX } from "../src/lib/card-seo";
import {
  buildCardNarrative,
  narrativeWordCount,
  type NarrativeInput,
  type NarrativeMarket,
} from "../src/lib/content/card-narrative";
import { parseSearchQuery } from "../src/lib/search-query";
import { buildCardWhere } from "../src/lib/cards";
import { TYPE_FACETS, RARITY_FACETS, PRINTING_FACETS } from "../src/lib/facets";
import { CARD_TYPES } from "../src/lib/constants";

// The TYPE half of the card-page SEO work. Its sibling, tests/card-printing-seo.test.ts,
// covers the PRINTING half ("shen signature riftbound"). This file covers the
// facet-shaped queries: "kennen legend riftbound", "epic fury spell", and the
// promise that adding all that did not move the ~1,200 base card titles that
// were already fine.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Comments out, code in. LINE comments go FIRST and deliberately so: the card
// page has a `//` comment containing the literal "/card/*", and stripping block
// comments first made that "/*" open a comment that swallowed 58KB of the file —
// every assertion below then passed against an empty string. The `[^:]` guard
// keeps "https://" in real code from being eaten as a comment.
const codeOnly = (src: string) =>
  src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const CARD_PAGE = "src/app/card/[id]/page.tsx";

interface TitleFixture {
  name: string;
  displayName?: string;
  setName: string;
  identCode: string;
  type: string;
  credentials?: string[];
  kind?: "base" | "signature" | "overnumbered" | "promo" | "alternate-art" | "crystal-rose";
}

const title = (f: TitleFixture, hasPrice = true) =>
  cardTitle({
    name: f.name,
    displayName: f.displayName ?? f.name,
    setName: f.setName,
    identCode: f.identCode,
    hasPrice,
    kind: f.kind ?? "base",
    type: f.type,
    credentials: f.credentials ?? [],
  });

// ── 1. The rung that exists for "kennen legend riftbound" ───────────────────

test("a base Legend's title names the champion, the type and the price", () => {
  const t = title({ name: "Ahri, Nine-Tailed Fox", setName: "Origins", identCode: "OGN 255/298", type: "Legend" });
  assert.equal(t, "Ahri Legend Price — Riftbound OGN 255/298");
  assert.ok(titleFits(t));
});

test("the owner's literal example resolves", () => {
  // "kennen legend riftbound". Kennen's Legend is Heart of the Tempest.
  const t = title({
    name: "Kennen, Heart of the Tempest",
    setName: "Vendetta",
    identCode: "VEN 197/166",
    type: "Legend",
  });
  assert.match(t, /Kennen Legend/);
  assert.match(t, /Riftbound/);
  assert.ok(titleFits(t), `${t} is ${t.length + " | RiftCompare".length}`);
});

test("only Legend gets a type rung — nobody searches 'ahri unit riftbound'", () => {
  for (const type of CARD_TYPES.filter((t) => t !== "Legend")) {
    const t = title({ name: "Kennen, Storm of Shuriken", setName: "Vendetta", identCode: "VEN 113/166", type });
    assert.doesNotMatch(t, new RegExp(type), `${type} leaked into the title: ${t}`);
  }
});

// ── 2. What must not move ───────────────────────────────────────────────────

test("a comma-less base card's title is byte-identical to what shipped before the type rungs", () => {
  // No champion half means nothing to shorten, so the short-name rungs collapse
  // into their full-name siblings and are dropped by the de-duplication. These
  // three strings are the e2125c9 ladder's output, verbatim.
  assert.equal(
    title({ name: "Moonfall", setName: "Unleashed", identCode: "UNL 198/219", type: "Spell" }),
    "Moonfall Price — Riftbound UNL 198/219"
  );
  assert.equal(
    title({ name: "Discipline", setName: "Origins", identCode: "OGN 058/298", type: "Spell" }),
    "Discipline Price — Riftbound OGN 058/298"
  );
  assert.equal(
    title({ name: "Moonfall", setName: "Unleashed", identCode: "UNL 198/219", type: "Spell" }, false),
    "Moonfall — Riftbound UNL 198/219 | Card Text"
  );
});

test("a short comma name keeps its full name — rung 1 or 2 fits, so nothing shortens", () => {
  // Rung 1, set name and all, at 58 with the suffix.
  assert.equal(
    title({ name: "Vi, Rogue", setName: "Origins", identCode: "OGN 36", type: "Unit" }),
    "Vi, Rogue Price — Riftbound Origins (OGN 36)"
  );
  // Rung 2: the set name does not fit but the full name still does, so the
  // epithet survives. Only cards that overflow BOTH get shortened.
  assert.equal(
    title({ name: "Vi, Destructive", setName: "Origins", identCode: "OGN 036", type: "Unit" }),
    "Vi, Destructive Price — Riftbound OGN 036"
  );
});

// ── 3. The near-duplicate trap the credentials field exists to close ────────

test("a base Showcase printing's title stays distinguishable from its plain sibling", () => {
  // These two rows share a name, a set and near-identical collector numbers
  // ("151a/298" vs "151/298"). If the shortened rung dropped the credential the
  // titles would differ by one character sitting next to digits — and Google's
  // near-duplicate clustering discounts digits, which is how one of a pair ends
  // up unindexed. This is the assertion that keeps them apart.
  const plain = title({ name: "Lee Sin, Centered", setName: "Origins", identCode: "OGN 151/298", type: "Unit" });
  const showcase = title({
    name: "Lee Sin, Centered",
    displayName: "Lee Sin, Centered (Showcase)",
    setName: "Origins",
    identCode: "OGN 151a/298",
    type: "Unit",
    credentials: ["Showcase"],
  });
  assert.notEqual(plain, showcase);
  assert.match(showcase, /Showcase/, `the credential must survive shortening: ${showcase}`);
  // Strip every digit and the "a" variant letter: what is left must STILL differ,
  // so the pair cannot collapse under a digit-insensitive comparison.
  const skeleton = (s: string) => s.replace(/[0-9]/g, "").replace(/\s+/g, " ");
  assert.notEqual(skeleton(plain), skeleton(showcase));
});

// ── 4. Printing beats type, structurally ────────────────────────────────────

test("a Signature Legend's title names the Signature, not the Legend", () => {
  // The type rungs live inside `if (kind === "base")` and the printing rungs
  // inside its else, so the two cannot both appear. The printing is what
  // separates two rows sharing a name; the type is not.
  const t = title({
    name: "Kennen, Heart of the Tempest",
    displayName: "Kennen, Heart of the Tempest (Showcase, Signature)",
    setName: "Vendetta",
    identCode: "VEN 197*/166",
    type: "Legend",
    credentials: ["Showcase", "Signature"],
    kind: "signature",
  });
  assert.match(t, /Signature/);
  assert.doesNotMatch(t, /Legend/);
  assert.ok(titleFits(t));
});

test("the previous pass's overnumbered result is unchanged", () => {
  // Regression guard on e2125c9 — the owner's second example query.
  assert.equal(
    title({
      name: "Ahri, Nine-Tailed Fox",
      displayName: "Ahri, Nine-Tailed Fox (Showcase, Overnumbered)",
      setName: "Origins",
      identCode: "OGN 303/298",
      type: "Legend",
      credentials: ["Showcase", "Overnumbered"],
      kind: "overnumbered",
    }),
    // 61 characters with "Price" and the suffix, so the ladder's last rung drops
    // it — exactly as it did before this pass. The query phrase survives, which
    // is what the rung is for.
    "Ahri Overnumbered — Riftbound OGN 303/298"
  );
});

test("a comma-less special printing keeps its credential, even at the cost of 60 chars", () => {
  // Two catalogue-wide audit runs shaped this rung, and the second one reversed
  // the first. Run 1 found 69 titles over 60, none of them the comma-less long
  // NAME the ladder was designed around — they were special printings whose name
  // has no champion half, so nothing could shorten:
  //     "Plundering Poro Overnumbered Price — Riftbound UNL 222/219"  72
  // Run 2, after a rung was added that dropped the credential entirely, found
  // DUPLICATE titles — because a promo shares its base card's collector number,
  // so both reduced to "Eye of the Herald — Riftbound SFD 153/221".
  //
  // Uniqueness outranks length. A duplicate fails scripts/seo-gate.ts and can
  // cost a page its place in the index; an over-long title loses a few characters
  // of collector number to truncation. So the credential stays and a small
  // residue runs 61-66 characters.
  const special: [string, string[], string, "overnumbered" | "alternate-art" | "promo"][] = [
    ["Plundering Poro", ["Overnumbered"], "UNL 222/219", "overnumbered"],
    ["Red Brambleback", ["Alt Art"], "UNL 029a/219", "alternate-art"],
    ["Ravenbloom Student", ["Promo"], "OGN 103/298", "promo"],
    ["Seal of Focus", ["Overnumbered"], "SFD 226/221", "overnumbered"],
  ];
  for (const [name, credentials, identCode, kind] of special) {
    const t = title({
      name,
      displayName: `${name} (${credentials.join(", ")})`,
      setName: "Unleashed",
      identCode,
      type: "Unit",
      credentials,
      kind,
    });
    assert.ok(t.includes(credentials[0]), `the credential must survive: ${t}`);
    assert.ok(t.includes(identCode), t);
    // Bounded, so a regression cannot quietly return to the 82-character title
    // that started all of this.
    assert.ok(t.length + " | RiftCompare".length <= 70, `${t} is ${t.length + 14}`);
  }
});

test("when nothing fits, the SHORTEST candidate ships — not the last one written", () => {
  // An overnumbered reprint is Showcase by definition, so cardCredentials gives
  // ["Showcase", "Overnumbered"] and the pair says one thing twice. The ladder
  // produces both forms; neither fits; the old `?? last` shipped the longer one.
  const t = title({
    name: "Seal of Discord",
    displayName: "Seal of Discord (Showcase, Overnumbered)",
    setName: "Spiritforged",
    identCode: "SFD 234/221",
    type: "Gear",
    credentials: ["Showcase", "Overnumbered"],
    kind: "overnumbered",
  });
  assert.equal(t, "Seal of Discord Overnumbered — Riftbound SFD 234/221");
  // Rung order says what we would RATHER keep; it is not a claim about length, so
  // it must not decide the overflow case.
  assert.ok(!t.includes("Showcase"), t);
  assert.ok(t.includes("Overnumbered"), "the distinguishing word must survive");
});

test("a promo never shares a title with the base card it reprints", () => {
  // THE DUPLICATE THE AUDIT CAUGHT. A promo shares its base card's collector
  // number — that is why cardSlug appends "-promo" (lib/card-url.ts) — so the
  // credential is the ONLY thing separating the two titles. identCode is not
  // enough here, which is exactly what the reasoning behind the deleted rung got
  // wrong.
  const base = title({
    name: "Eye of the Herald",
    setName: "Spiritforged",
    identCode: "SFD 153/221",
    type: "Gear",
  });
  const promo = title({
    name: "Eye of the Herald",
    displayName: "Eye of the Herald (Promo)",
    setName: "Spiritforged",
    identCode: "SFD 153/221",
    type: "Gear",
    credentials: ["Promo"],
    kind: "promo",
  });
  assert.notEqual(base, promo);
  assert.match(promo, /Promo/);
});

test("the abbreviated credential is preferred over dropping it entirely", () => {
  // cardCredentials calls a variant "Alt Art" (7 chars) where PRINTING_DISPLAY
  // calls it "Alternate art" (13). When the long form overflows and the short one
  // fits, the credential survives rather than being thrown away.
  const t = title({
    name: "Master Yi, Tempered",
    displayName: "Master Yi, Tempered (Alt Art)",
    setName: "Unleashed",
    identCode: "UNL 113a/219",
    type: "Unit",
    credentials: ["Alt Art"],
    kind: "alternate-art",
  });
  assert.equal(t, "Master Yi Alt Art — Riftbound UNL 113a/219");
});

// ── 5. The invariants that hold for every combination ──────────────────────

test("every title keeps the collector number, whatever the ladder chooses", () => {
  for (const type of CARD_TYPES) {
    for (const kind of ["base", "signature", "overnumbered", "promo", "alternate-art"] as const) {
      for (const hasPrice of [true, false]) {
        const t = title(
          {
            name: "Kai'Sa, Daughter of the Void",
            displayName: "Kai'Sa, Daughter of the Void (Showcase, Signature)",
            setName: "Spiritforged",
            identCode: "SFD 223*/221",
            type,
            credentials: ["Showcase", "Signature"],
            kind,
          },
          hasPrice
        );
        assert.ok(t.includes("SFD 223*/221"), `${kind}/${type}: ${t}`);
        assert.match(t, /Riftbound/, `${kind}/${type}: ${t}`);
      }
    }
  }
});

test("a champion card with a long name fits, where it used to overflow", () => {
  // "Kennen, Storm of Shuriken — Riftbound VEN 113/166" is 63 with the suffix and
  // is live on the site today, shipped by the `?? last` fallthrough.
  const t = title({ name: "Kennen, Storm of Shuriken", setName: "Vendetta", identCode: "VEN 113/166", type: "Unit" });
  assert.ok(titleFits(t), `${t} is ${t.length + " | RiftCompare".length}, limit ${TITLE_MAX}`);
  assert.match(t, /Price/);
});

// ── 6. The description says what the card is ───────────────────────────────

const DESC = {
  identCode: "OGN 255/298",
  setName: "Origins",
  collectorNumber: "255/298",
  statBit: "Calm legend · Rare",
  priceBit: "Live prices from US$4.20 across 3 stores, updated daily.",
};

test("a card with rules text now names its domain, type and rarity", () => {
  const d = cardMetaDescription({
    ...DESC,
    displayName: "Ahri, Nine-Tailed Fox",
    kind: "base",
    textBit: "Whenever you play a champion unit, draw a card and gain 1 energy.",
  });
  assert.match(d, /Calm legend · Rare/);
  // And it lands EARLY — inside the ~155-160 characters Google renders.
  assert.ok(d.indexOf("Calm legend") < 60, `statBit at ${d.indexOf("Calm legend")}: ${d}`);
});

test("naming the card is paid for out of the rules-text tail, not added on top", () => {
  // The clamp at page.tsx dropped from 90 to 70 in the same change, so the
  // description is no longer than it was. The tail that got clipped was already
  // past Google's truncation point; the domain/type/rarity words are not.
  const withStat = cardMetaDescription({
    ...DESC,
    displayName: "Ahri, Nine-Tailed Fox",
    kind: "base",
    textBit: "x".repeat(70),
  });
  const asItWas = `Ahri, Nine-Tailed Fox (Riftbound ${DESC.identCode}) — ${"x".repeat(90)} ${DESC.priceBit}`;
  assert.ok(
    withStat.length <= asItWas.length,
    `grew from ${asItWas.length} to ${withStat.length}: ${withStat}`
  );
});

test("a special printing still says which printing, and now also what it is", () => {
  const d = cardMetaDescription({
    ...DESC,
    displayName: "Ahri, Nine-Tailed Fox (Showcase, Overnumbered)",
    kind: "overnumbered",
    textBit: "Whenever you play a champion unit, draw a card.",
  });
  assert.match(d, /the overnumbered printing/);
  assert.match(d, /Calm legend · Rare/);
});

// ── 7. The About narrative names the type on special printings ─────────────

const market = (over: Partial<NarrativeMarket> = {}): NarrativeMarket => ({
  country: "US",
  place: "the US",
  currency: "USD",
  lowestCents: 12000,
  lowestDeliveredCents: 13500,
  secondCents: 14000,
  storeCount: 4,
  listingCount: 7,
  cheapestNonFoilCents: 12000,
  cheapestFoilCents: 26000,
  cheapestNearMintCents: 12000,
  cheapestPlayedCents: 9500,
  ...over,
});

const narrativeCard = (over: Partial<NarrativeInput> = {}): NarrativeInput => ({
  name: "Ahri, Nine-Tailed Fox",
  displayName: "Ahri, Nine-Tailed Fox (Showcase, Signature)",
  setName: "Origins",
  setCode: "OGN",
  collectorNumber: "303*/298",
  rarity: "Showcase",
  type: "Legend",
  domain: "Calm",
  variant: null,
  isPromo: false,
  energyCost: 4,
  might: 5,
  power: null,
  isSignature: true,
  isOvernumbered: true,
  isCrystalRose: false,
  baseline: market(),
  markets: [market(), market({ country: "AU", place: "Australia", currency: "AUD", lowestCents: 18000 })],
  history: {
    points: Array.from({ length: 120 }, (_, i) => ({ t: 1_760_000_000_000 + i * 86_400_000, v: 10000 + i * 12 })),
  },
  printings: [{ label: "Base", priceCents: 400, isBase: true }],
  setContext: { pricedInSet: 200, cheaperThan: 190, setMedianCents: 600 },
  ...over,
});

const opening = (c: NarrativeInput) => buildCardNarrative(c)[0];

test("every special printing's opening names the card type", () => {
  // `kind` (rarity + type) is reachable only from the two BASE branches, so
  // before this change a Signature, Crystal Rose, promo or overnumbered page
  // never said whether it was a Legend or a Spell.
  assert.match(opening(narrativeCard()), /It is a Legend in the Calm domain/);
  assert.match(
    opening(narrativeCard({ isSignature: false, isPromo: true, collectorNumber: "255/298", isOvernumbered: false })),
    /It is a Legend in the Calm domain/
  );
  assert.match(
    opening(narrativeCard({ isSignature: false, isOvernumbered: true, collectorNumber: "303/298" })),
    /It is a Legend in the Calm domain/
  );
  assert.match(
    opening(narrativeCard({ isSignature: false, isCrystalRose: true, setCode: "VEN", collectorNumber: "SP1" })),
    /It is a Legend in the Calm domain/
  );
});

test("the type word is capitalised and takes 'a', never 'an Unit'", () => {
  // Unit starts with a vowel LETTER and a consonant SOUND, so the first-letter
  // article test that works for rarity would produce "an Unit".
  const t = opening(narrativeCard({ type: "Unit" }));
  assert.match(t, /It is a Unit in the Calm domain/);
  assert.doesNotMatch(t, /an Unit/);
});

test("a Colorless special printing reads correctly too", () => {
  assert.match(opening(narrativeCard({ domain: "Colorless" })), /It is a Legend with no domain/);
});

test("the two base openings are untouched", () => {
  const base = { isSignature: false, isOvernumbered: false, isCrystalRose: false, isPromo: false, variant: null };
  assert.match(
    opening(narrativeCard({ ...base, collectorNumber: "255/298", rarity: "Rare" })),
    /as a rare legend in Origins \(OGN\)/
  );
  // The base branches say the type inside `kind`; saying it twice would be worse
  // than not saying it at all.
  assert.doesNotMatch(opening(narrativeCard({ ...base, collectorNumber: "255/298" })), /It is a Legend/);
});

test("naming the type did not cost the page its editorial weight", () => {
  assert.ok(narrativeWordCount(buildCardNarrative(narrativeCard())) >= 200);
});

// ── 8. The search box, and the trap it must not fall into ──────────────────

test("a facet word becomes a scoped reading of the phrase", () => {
  const p = parseSearchQuery("kennen legend riftbound");
  assert.equal(p.name, "kennen");
  assert.deepEqual(p.scoped, { type: "Legend" });
  // NOT in `filters` — filters are top-level constraints and a facet word can
  // never be one.
  assert.deepEqual(p.filters, {});

  assert.deepEqual(parseSearchQuery("epic fury spell").scoped, {
    rarity: "Epic",
    domain: "Fury",
    type: "Spell",
  });
});

test("a card whose own NAME contains a facet word is never turned into a filter", () => {
  // "rune" appears in 31 card names ("Fury Rune", "Rune Prison") and "legends" in
  // one ("Hall of Legends"). Neither is mapped at all.
  for (const q of ["rune prison", "hall of legends", "fury rune", "blind fury"]) {
    const w = buildCardWhere({ q }) as { type?: unknown; OR?: { nameNormalized?: { contains: string } }[] };
    assert.equal(w.type, undefined, `${q} must not set a top-level type`);
    assert.ok(
      w.OR?.some((c) => c.nameNormalized?.contains === q.replace(/[^a-z0-9]/gi, "").toLowerCase()),
      `${q} must still be searchable as a literal name: ${JSON.stringify(w)}`
    );
  }
  assert.deepEqual(parseSearchQuery("rune prison").scoped, {});
  assert.deepEqual(parseSearchQuery("hall of legends").scoped, {});
});

test("the literal whole-phrase name match always comes first", () => {
  const w = buildCardWhere({ q: "kennen legend" }) as { OR: { nameNormalized?: { contains: string } }[] };
  assert.equal(w.OR[0].nameNormalized?.contains, "kennenlegend");
  // ...and the scoped reading is an ALTERNATIVE, never a constraint.
  assert.equal((w as { type?: unknown }).type, undefined);
  assert.ok(JSON.stringify(w).includes('"type":"Legend"'));
});

test("a query that is nothing but facet words returns the whole shelf", () => {
  const w = buildCardWhere({ q: "epic fury spell" }) as Record<string, unknown>;
  assert.equal(w.type, "Spell");
  assert.equal(w.domain, "Fury");
  assert.equal(w.rarity, "Epic");
  // No name to protect, so no OR is needed.
  assert.equal(w.OR, undefined);
});

test("an explicit URL filter still beats an inferred facet word", () => {
  const w = buildCardWhere({ q: "kennen legend", type: "Spell" }) as { type?: unknown };
  assert.deepEqual(w.type, { in: ["Spell"] });
  assert.ok(!JSON.stringify(w).includes('"type":"Legend"'));
});

test("no facet word can produce a match-everything LIKE", () => {
  // normalizeSearch("") is "", and Prisma's `contains: ""` is LIKE '%%' — every
  // row in the table. Sweep every facet term alone and in pairs.
  const terms = [
    "legend", "unit", "spell", "gear", "battlefield",
    "fury", "calm", "mind", "body", "chaos", "order", "colorless",
    "common", "uncommon", "rare", "epic",
  ];
  for (const a of terms) {
    for (const b of terms) {
      const w = JSON.stringify(buildCardWhere({ q: `${a} ${b}` }));
      assert.doesNotMatch(w, /"contains":""/, `"${a} ${b}" produced a match-everything filter: ${w}`);
    }
  }
});

test("the facet hubs' own counts cannot move — they gate a noindex", () => {
  // lib/sitemap-sections.ts counts each facet with buildCardWhere(facet.query) and
  // drops the page from the sitemap below FACET_THIN_THRESHOLD. Those queries
  // carry no `q`, so the whole typed-phrase block is unreachable from them. If a
  // facet ever gained a `q`, this test is the thing that notices.
  for (const f of [...TYPE_FACETS, ...RARITY_FACETS, ...PRINTING_FACETS]) {
    assert.equal((f.query as { q?: string }).q, undefined, `${f.slug} must not carry a q`);
    const w = buildCardWhere(f.query) as { OR?: unknown };
    assert.equal(w.OR, undefined, `${f.slug} must not gain an OR`);
  }
});

// ── 9. The page, the markup, and the two new scripts ──────────────────────

test("the card-details table names the type and the domain", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /Type<\/dt>\s*<dd className="text-slate-200">\{card\.type\}/);
  assert.match(code, /Domain<\/dt>\s*<dd className="text-slate-200">\{card\.domain\}/);
  assert.match(code, /Collector number<\/dt>/);
  // Nullable stats are guarded — an omitted cell is honest, a zero is not.
  assert.match(code, /card\.energyCost != null && \(/);
  assert.match(code, /card\.might == null && card\.power != null && \(/);
});

test("Product markup publishes Power, the one attribute the page rendered and the markup did not", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /name: "Power", value: String\(card\.power\)/);
  assert.match(code, /card\.power != null \?/);
});

test("the URL Inspection script targets the v1 endpoint, not the v3 one", () => {
  const src = read("scripts/gsc-url-inspect.ts");
  // searchAnalytics lives under /webmasters/v3/sites/... and URL Inspection does
  // not. Copying the neighbouring helper's base URL returns 404.
  assert.match(src, /"https:\/\/searchconsole\.googleapis\.com\/v1\/urlInspection\/index:inspect"/);
  const code = codeOnly(src);
  assert.doesNotMatch(code, /webmasters\/v3/);
});

test("the URL Inspection script stays inside Google's published quota", () => {
  const code = codeOnly(read("scripts/gsc-url-inspect.ts"));
  const num = (name: string) => {
    const m = code.match(new RegExp(`const ${name} = (\\d+)`));
    assert.ok(m, `${name} not found`);
    return parseInt(m![1], 10);
  };
  // 2,000/day and 600/min per site.
  assert.equal(num("QUOTA_PER_DAY"), 2000);
  assert.equal(num("QUOTA_PER_MINUTE"), 600);
  assert.ok(num("PER_MINUTE") < num("QUOTA_PER_MINUTE"), "leave headroom under the per-minute ceiling");
  assert.ok(num("MAX_INSPECTIONS") < num("QUOTA_PER_DAY"), "never let one run reach the daily ceiling");
  // Concurrency is a LATENCY control, not a rate control — every worker draws
  // from the same token bucket, so raising it cannot breach the per-minute
  // quota. It exists because the first real run was cancelled at a 30-minute
  // job timeout: an index:inspect call takes seconds, so 1,425 of them at 5 in
  // flight is ~24 minutes of waiting, not 2.6 minutes of pacing.
  assert.ok(num("CONCURRENCY") <= num("PER_MINUTE"), "concurrency cannot exceed the per-minute budget");
  assert.ok(num("CONCURRENCY") >= 10, "too low and the run cannot finish inside its job timeout");
});

test("a cancelled coverage run still leaves the rows it collected", () => {
  const code = codeOnly(read("scripts/gsc-url-inspect.ts"));
  // The first run died at a job timeout having written nothing, so the whole
  // 30 minutes of inspection was lost.
  assert.match(code, /rows\.length % FLUSH_EVERY === 0/);
  assert.match(code, /const flush = \(\) =>/);
  const wf = read(".github/workflows/gsc-index-coverage.yml");
  assert.match(wf, /timeout-minutes: 60/);
});

test("the URL Inspection script never touches either database", () => {
  const code = codeOnly(read("scripts/gsc-url-inspect.ts"));
  assert.doesNotMatch(code, /from "\.\.\/src\/lib\/db/);
  assert.doesNotMatch(code, /prisma/);
});

test("the coverage report runs weekly, not daily — the quota is shared with a person", () => {
  const wf = read(".github/workflows/gsc-index-coverage.yml");
  // A daily run at ~1,425 of 2,000 inspections would leave the property
  // effectively uninspectable by hand for the rest of each day.
  assert.match(wf, /cron: "40 5 \* \* 1"/);
  assert.doesNotMatch(wf, /cron: "[^"]*\* \* \*"/, "must not be scheduled daily");
  assert.match(wf, /GSC_SA_KEY/);
  // No key means skip, never fail — same contract as gsc-coverage.yml.
  assert.match(wf, /if \[ -z "\$GSC_SA_KEY" \]/);
});

test("both read-only audits are dispatchable, and coverage runs the census first", () => {
  const wf = read(".github/workflows/maintenance.yml");
  assert.match(wf, /- index-coverage/);
  assert.match(wf, /- audit-card-titles/);
  assert.match(wf, /npx tsx scripts\/audit-card-titles\.ts/);
  // The census must run BEFORE the inspection: cards.xml is built by subtracting
  // a set computed from the cross-database join, so a broken join means the
  // coverage numbers are measured against the wrong list of URLs.
  const step = wf.slice(wf.indexOf("Index coverage ("));
  const census = step.indexOf("scripts/audit-indexability.ts");
  const inspect = step.indexOf("scripts/gsc-url-inspect.ts");
  assert.ok(census > 0 && inspect > census, "audit-indexability must run before gsc-url-inspect");
});

test("the title audit is the only place the whole catalogue is checked, and it reads one query", () => {
  const code = codeOnly(read("scripts/audit-card-titles.ts"));
  assert.equal((code.match(/prisma\.card\.findMany/g) ?? []).length, 1);
  assert.doesNotMatch(code, /prisma\.card\.count|prisma\.retailerPrice/);
  // It must fail loudly on a duplicate — seo-gate.ts fails the build on one, but
  // only after the release.
  assert.match(code, /process\.exitCode = 1/);
});
