import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cardTitle, cardMetaDescription, titleFits, TITLE_MAX } from "../src/lib/card-seo";
import { shortCardName, cardDisplayName } from "../src/lib/card-name";
import {
  buildCardNarrative,
  narrativeWordCount,
  printingFieldsFrom,
  printingKind,
  type NarrativeInput,
  type NarrativeMarket,
} from "../src/lib/content/card-narrative";
import { CARD_ALIASES, aliasesForSlug, aliasSlugsFor } from "../src/lib/content/card-aliases";
import { parseSearchQuery } from "../src/lib/search-query";
import { buildCardWhere } from "../src/lib/cards";

// Every printing of a Riftbound card is its own row with its own page, and the
// site's best long-tail traffic is people searching for ONE of them: "shen
// signature riftbound", "akali overnumbered". This file pins the three places
// that decide whether such a page can be found — the <title>, the words on the
// page, and what the search box does with the same phrase typed back into it.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Comments out, code in. LINE comments go FIRST and deliberately so: the card
// page has a `//` comment containing the literal "/card/*", and stripping block
// comments first made that "/*" open a comment that swallowed 58KB of the file —
// every assertion below then passed against an empty string. The `[^:]` guard
// keeps "https://" in real code from being eaten as a comment.
const codeOnly = (src: string) =>
  src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const CARD_PAGE = "src/app/card/[id]/page.tsx";

// ── 1. One derivation of "which printing is this?" ───────────────────────────
// The body derived all three flags from the collector number; generateMetadata
// derived none, so it could only ever see promo/alt-art/base and every Signature
// page described itself as an ordinary printing. One helper now, both callers.

test("printingFieldsFrom reads the printing off the collector number and set", () => {
  assert.equal(printingKind(printingFieldsFrom({ setCode: "VEN", collectorNumber: "193*/166" })), "signature");
  assert.equal(printingKind(printingFieldsFrom({ setCode: "OGN", collectorNumber: "300/298" })), "overnumbered");
  assert.equal(printingKind(printingFieldsFrom({ setCode: "VEN", collectorNumber: "SP1" })), "crystal-rose");
  assert.equal(
    printingKind(printingFieldsFrom({ setCode: "OGN", collectorNumber: "042/298", isPromo: true })),
    "promo"
  );
  assert.equal(printingKind(printingFieldsFrom({ setCode: "OGN", collectorNumber: "042/298" })), "base");
});

test("the card page derives its printing through that one helper, not by hand", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /const thisPrinting = printingFieldsFrom\(card\)/);
  // Two hand-built flag objects is exactly the bug: they drifted.
  assert.equal((code.match(/isSignature: isSignature\(/g) ?? []).length, 0);
});

// ── 2. The title has to still say "Riftbound" after Google truncates it ──────

const SHEN = {
  name: "Shen, Eye of Twilight",
  displayName: "Shen, Eye of Twilight (Showcase, Signature)",
  setName: "Vendetta",
  identCode: "VEN 193*/166",
  kind: "signature" as const,
};

test("a Signature card's title fits, and keeps the short name, the printing and Riftbound", () => {
  for (const hasPrice of [true, false]) {
    const title = cardTitle({ ...SHEN, hasPrice });
    assert.ok(titleFits(title), `over ${TITLE_MAX} with the suffix: ${title}`);
    assert.match(title, /Shen Signature/, "the phrase people actually type");
    assert.match(title, /Riftbound/, "the word the old 82-char title lost to truncation");
    assert.ok(title.includes("VEN 193*/166"), "the ident is what separates two printings");
  }
});

test("a long Overnumbered name needs the last rung — the one that drops 'Price'", () => {
  const title = cardTitle({
    name: "Akali, Rogue Assassin",
    displayName: "Akali, Rogue Assassin (Overnumbered)",
    setName: "Vendetta",
    identCode: "VEN 189/166",
    hasPrice: true,
    kind: "overnumbered",
  });
  assert.ok(titleFits(title), `over ${TITLE_MAX} with the suffix: ${title}`);
  assert.match(title, /Akali Overnumbered/);
  assert.match(title, /Riftbound/);
  // "Akali Overnumbered Price — Riftbound VEN 189/166" is 62 with the suffix, so
  // the fitting rung is the one without "Price". Losing that word costs less than
  // losing "Riftbound" or the collector number, which is what used to happen.
  assert.doesNotMatch(title, /Price/);
});

test("base cards keep byte-identical titles — ~1,200 pages must not move", () => {
  const priced = cardTitle({
    name: "Moonfall",
    displayName: "Moonfall",
    setName: "Unleashed",
    identCode: "UNL 198",
    hasPrice: true,
    kind: "base",
  });
  assert.equal(priced, "Moonfall Price — Riftbound Unleashed (UNL 198)");
  const unpriced = cardTitle({
    name: "Moonfall",
    displayName: "Moonfall",
    setName: "Unleashed",
    identCode: "UNL 198",
    hasPrice: false,
    kind: "base",
  });
  // The set-name rung does not fit here ("… Riftbound Unleashed (UNL 198) | Card
  // Text | RiftCompare" is 65), so the second rung wins — exactly as before.
  assert.equal(unpriced, "Moonfall — Riftbound UNL 198 | Card Text");
});

test("shortCardName takes the champion half, and leaves a comma-less name alone", () => {
  assert.equal(shortCardName("Shen, Eye of Twilight"), "Shen");
  assert.equal(shortCardName("Moonfall"), "Moonfall");
  assert.equal(shortCardName(", Nobody"), ", Nobody");
});

// ── 3. The meta description names the printing in BOTH branches ─────────────

const DESC = {
  displayName: SHEN.displayName,
  identCode: SHEN.identCode,
  setName: SHEN.setName,
  collectorNumber: "193*/166",
  statBit: "Fury unit · Showcase",
  priceBit: "Compare live prices across AU, US and UK.",
};

test("a card WITH rules text still says which printing it is", () => {
  const d = cardMetaDescription({ ...DESC, kind: "signature", textBit: "Deal 3 damage to a unit." });
  assert.match(d, /the Signature printing/);
});

test("a card WITHOUT rules text says it too", () => {
  const d = cardMetaDescription({ ...DESC, kind: "signature", textBit: null });
  assert.match(d, /the Signature printing/);
});

test("a base card's description gains nothing — there is no printing to name", () => {
  const d = cardMetaDescription({
    displayName: "Moonfall",
    identCode: "UNL 198",
    setName: "Unleashed",
    collectorNumber: "198",
    kind: "base",
    textBit: "Deal 3 damage to a unit.",
    statBit: "Fury spell · Rare",
    priceBit: "Compare live prices.",
  });
  assert.equal(d, "Moonfall (Riftbound UNL 198) — Deal 3 damage to a unit. Compare live prices.");
});

test("a nickname is appended last, so it can never displace the price", () => {
  const d = cardMetaDescription({
    ...DESC,
    kind: "signature",
    textBit: "Deal 3 damage to a unit.",
    aliases: ["Armpit Boi"],
  });
  assert.ok(d.endsWith('Also known as "Armpit Boi".'), d);
  assert.ok(d.indexOf(DESC.priceBit) < d.indexOf("Armpit Boi"));
});

// ── 4. The query-shaped phrase, visible on the page, exactly once ───────────

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
  name: "Shen, Eye of Twilight",
  displayName: "Shen, Eye of Twilight (Showcase, Signature)",
  setName: "Vendetta",
  setCode: "VEN",
  collectorNumber: "193*/166",
  rarity: "Showcase",
  type: "Unit",
  domain: "Order",
  variant: null,
  isPromo: false,
  energyCost: 4,
  might: 5,
  power: null,
  isSignature: true,
  isOvernumbered: true,
  isCrystalRose: false,
  baseline: market(),
  markets: [market(), market({ country: "AU", place: "Australia", currency: "AUD", lowestCents: 18000, lowestDeliveredCents: 22000 })],
  history: {
    points: Array.from({ length: 120 }, (_, i) => ({ t: 1_760_000_000_000 + i * 86_400_000, v: 10000 + i * 12 })),
  },
  printings: [{ label: "Base", priceCents: 400, isBase: true }],
  setContext: { pricedInSet: 200, cheaperThan: 190, setMedianCents: 600 },
  ...over,
});

const narrative = (c: NarrativeInput) => buildCardNarrative(c).join("\n");

test("the About section opens on the phrase a collector types", () => {
  assert.match(narrative(narrativeCard()), /Shen Signature is the Signature print of Shen, Eye of Twilight/);
});

test("an overnumbered printing gets the same treatment", () => {
  const text = narrative(
    narrativeCard({
      name: "Akali, Rogue Assassin",
      displayName: "Akali, Rogue Assassin (Overnumbered)",
      collectorNumber: "189/166",
      rarity: "Epic",
      isSignature: false,
      isOvernumbered: true,
    })
  );
  assert.match(text, /This page covers Akali Overnumbered — the overnumbered printing of Akali, Rogue Assassin/);
});

test("a comma-less name is left exactly as it was — 'Moonfall Signature' is not a thing", () => {
  const text = narrative(
    narrativeCard({
      name: "Moonfall",
      displayName: "Moonfall (Signature)",
      setName: "Unleashed",
      setCode: "UNL",
      collectorNumber: "198*/196",
    })
  );
  assert.match(text, /Moonfall \(Signature\) is the Signature print of Moonfall/);
});

test("a base printing claims no printing at all", () => {
  const text = narrative(
    narrativeCard({
      displayName: "Shen, Eye of Twilight",
      collectorNumber: "093/166",
      rarity: "Epic",
      isSignature: false,
      isOvernumbered: false,
    })
  );
  assert.doesNotMatch(text, /printing of/);
  assert.doesNotMatch(text, /Shen Signature/);
});

test("naming the printing did not cost the page its editorial weight", () => {
  assert.ok(narrativeWordCount(buildCardNarrative(narrativeCard())) >= 200);
});

test("the card page subtitle leads with the printing for anything but a base card", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /thisPrintingKind !== "base" \? `\$\{PRINTING_DISPLAY\[thisPrintingKind\]\} printing · ` : ""/);
});

// ── 5. Nicknames ────────────────────────────────────────────────────────────

const SHEN_SIG_SLUG = "shen-eye-of-twilight-ven-193s-166";

test("the verified nicknames resolve, in both directions", () => {
  assert.deepEqual(aliasesForSlug(SHEN_SIG_SLUG), ["Armpit Boi", "Armpit Shen"]);
  assert.deepEqual(aliasSlugsFor("armpit boi"), [SHEN_SIG_SLUG]);
  // 711 impressions in the 28 days to 2026-09-17, at position 5.9.
  assert.deepEqual(aliasSlugsFor("armpit shen"), [SHEN_SIG_SLUG]);
  assert.deepEqual(aliasSlugsFor("armpit boi riftbound"), [SHEN_SIG_SLUG], "extra words must not break it");
  assert.deepEqual(aliasSlugsFor("Armpit-Boi"), [SHEN_SIG_SLUG], "punctuation is normalised away");
  assert.deepEqual(aliasSlugsFor("armpit"), [SHEN_SIG_SLUG], "still being typed");
});

test("a plain card name must NOT be captured by a nickname that contains it", () => {
  // "Armpit Shen" compacts to "armpitshen", which contains "shen". If the
  // second match direction were a substring test rather than a prefix test,
  // searching "shen" would rank one Signature printing above every Shen card
  // on the site. This is the assertion that keeps the alias map in its lane.
  assert.deepEqual(aliasSlugsFor("shen"), []);
  assert.deepEqual(aliasSlugsFor("shen eye of twilight"), []);
  assert.deepEqual(aliasSlugsFor("bo"), [], "the 3-character floor");
  assert.deepEqual(aliasesForSlug(null), []);
});

test("every alias key is a slug, because that is what the card page is keyed by", () => {
  for (const key of Object.keys(CARD_ALIASES)) {
    assert.match(key, /^[a-z0-9-]+$/, key);
    assert.ok(CARD_ALIASES[key].length > 0, `${key} has no nicknames`);
  }
});

// ── 6. The same phrase, typed back into the search box ──────────────────────

test("a printing word becomes the filter the browse chips would have set", () => {
  assert.deepEqual(parseSearchQuery("akali overnumbered"), {
    name: "akali",
    filters: { over: "1" },
    aliasSlugs: [],
  });
  const shen = parseSearchQuery("Shen signature riftbound");
  assert.equal(shen.name, "shen");
  assert.equal(shen.filters.sig, "1");
  assert.equal(parseSearchQuery("alt art jinx").filters.variant, "alt");
  assert.equal(parseSearchQuery("alternate art jinx").name, "jinx");
  assert.equal(parseSearchQuery("over-numbered vi").filters.over, "1");
  assert.equal(parseSearchQuery("jinx promo").filters.promo, "1");
  assert.equal(parseSearchQuery("crystal rose ahri").filters.set, "VEN");
  assert.deepEqual(parseSearchQuery("armpit boi").aliasSlugs, [SHEN_SIG_SLUG]);
});

test("a bare English fragment is NOT a filter — the silent-wrong-results case", () => {
  // "over" and "alt" are ordinary words and plausible name fragments. Mapping
  // them would remove results the visitor asked for, invisibly.
  assert.deepEqual(parseSearchQuery("over").filters, {});
  assert.deepEqual(parseSearchQuery("alt").filters, {});
  assert.equal(parseSearchQuery("over").name, "over");
});

test("buildCardWhere turns the typed phrase into the same WHERE as the chips", () => {
  const w = buildCardWhere({ q: "akali overnumbered" }) as {
    isOvernumbered?: boolean;
    OR?: { nameNormalized?: { contains: string }; slug?: { in: string[] } }[];
  };
  assert.equal(w.isOvernumbered, true);
  assert.ok(w.OR?.some((c) => c.nameNormalized?.contains === "akali"), JSON.stringify(w));
});

test("a nickname search looks the card up by slug", () => {
  const w = buildCardWhere({ q: "armpit boi" }) as { OR?: { slug?: { in: string[] } }[] };
  assert.ok(w.OR?.some((c) => c.slug?.in?.includes("shen-eye-of-twilight-ven-193s-166")), JSON.stringify(w));
});

test("an explicit URL filter still beats a word inferred from free text", () => {
  const w = buildCardWhere({ q: "signature", printing: "normal" }) as {
    collectorNumber?: { contains?: string; not?: { contains: string } };
  };
  // printing=normal is a deliberate choice made from the chips; "signature" is a
  // guess made from prose. The choice wins.
  assert.deepEqual(w.collectorNumber, { not: { contains: "*" } });
});

test("a query that is nothing but filter words still returns that whole shelf", () => {
  const w = buildCardWhere({ q: "signature" }) as { OR?: unknown[]; collectorNumber?: unknown };
  assert.deepEqual(w.collectorNumber, { contains: "*" });
  // An empty OR matches NOTHING in Prisma — it must be absent, not [].
  assert.equal(w.OR, undefined);
});

test("the typeahead shares that WHERE instead of rebuilding a name-only one", () => {
  const code = codeOnly(read("src/app/api/search/route.ts"));
  assert.match(code, /where: buildCardWhere\(\{ q \}, country\)/);
  assert.doesNotMatch(code, /nameNormalized: \{ contains/, "no second, weaker search path");
});

// ── 7. Structured data says which printing, too ─────────────────────────────

test("the Product carries the printing and the card's other real names", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /name: "Printing", value: PRINTING_DISPLAY\[thisPrintingKind\]/);
  assert.match(code, /alternateName: productAlternateNames/);
});

test("the last breadcrumb names the printing, not the shared card name", () => {
  const code = codeOnly(read(CARD_PAGE));
  const crumb = code.slice(code.indexOf("BreadcrumbList"), code.indexOf("BreadcrumbList") + 900);
  assert.match(crumb, /position: hasSetPage \? 4 : 3, name: displayName/);
});

test("the price FAQ is per-printing, and the 'worth it?' one is not", () => {
  const code = codeOnly(read(CARD_PAGE));
  assert.match(code, /How much does \$\{displayName\} cost\?/);
  // displayName here would ask whether the Signature is worth it over itself.
  assert.match(code, /worth it[^`]*\$\{card\.name\}|\$\{card\.name\}[^`]*worth it/);
});

test("cardDisplayName is untouched — the H1, Product name and eBay query ride on it", () => {
  assert.equal(
    cardDisplayName("Shen, Eye of Twilight", { rarity: "Showcase", collectorNumber: "193*/166" }),
    "Shen, Eye of Twilight (Showcase, Signature)"
  );
});
