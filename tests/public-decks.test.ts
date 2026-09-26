import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  changeSincePublished,
  checkPublishText,
  deckDomains,
  deckSlug,
  deckTotals,
  inPriceBand,
  legendSlugFrom,
  massEntry,
} from "../src/lib/published-decks";

const card = (us: number | null, au: number | null = null) => ({ lowestPriceCents: au, lowestPriceCentsUs: us });

test("deck totals sum qty × each market's cheapest price, null when any card is unpriced there", () => {
  const t = deckTotals([
    { qty: 3, card: card(100, 150) },
    { qty: 1, card: card(2500, null) },
  ]);
  assert.equal(t.US, 2800);
  assert.equal(t.AU, null); // one card has no AU price — never a partial sum
  assert.equal(deckTotals([]).US, null);
  assert.equal(deckTotals([{ qty: 1, card: undefined }]).US, null);
});

test("price bands: under $50, under $100, $200+; unpriced decks only in 'any'", () => {
  assert.ok(inPriceBand(4999, "u50") && !inPriceBand(5000, "u50"));
  assert.ok(inPriceBand(9999, "u100") && !inPriceBand(10000, "u100"));
  assert.ok(inPriceBand(20000, "200plus") && !inPriceBand(19999, "200plus"));
  assert.ok(inPriceBand(null, "all") && !inPriceBand(null, "u50"));
});

test("change since publish", () => {
  assert.equal(changeSincePublished(10000, 11050), 10.5);
  assert.equal(changeSincePublished(null, 100), null);
  assert.equal(changeSincePublished(0, 100), null);
});

test("Mass Entry is one 'qty Name' per line", () => {
  assert.equal(massEntry([{ qty: 3, name: "Jinx, Loose Cannon" }, { qty: 1, name: "Falling Star" }]), "3 Jinx, Loose Cannon\n1 Falling Star");
});

test("domains: two most-played, Colorless never counts", () => {
  assert.deepEqual(
    deckDomains([
      { qty: 12, domain: "Fury" },
      { qty: 9, domain: "Chaos" },
      { qty: 20, domain: "Colorless" },
      { qty: 3, domain: "Mind" },
    ]),
    ["Fury", "Chaos"],
  );
});

test("slugs: readable title plus an id suffix; legend slug from the champion", () => {
  assert.equal(deckSlug("Budget Jinx Aggro!", "abc123ff"), "budget-jinx-aggro-3ff".replace("3ff", "c123ff"));
  assert.equal(legendSlugFrom("Jinx, Loose Cannon", null), "jinx");
  assert.equal(legendSlugFrom("Master Yi, Wuju Bladesman", "master-yi"), "master-yi");
});

test("spam protection on title and description", () => {
  assert.equal(checkPublishText("Hi", "").ok, false);
  assert.equal(checkPublishText("Great deck", "buy at cheapcards.com now").ok, false);
  assert.equal(checkPublishText("Great deck", "see https://x.y").ok, false);
  assert.equal(checkPublishText("BUY MY CARDS NOW", "").ok, false);
  assert.equal(checkPublishText("Great deck", "aaaaaaaaaaaaaaa").ok, false);
  assert.deepEqual(checkPublishText("  Budget  Jinx ", "  Fast and cheap. "), { ok: true, title: "Budget Jinx", description: "Fast and cheap." });
});

test("publishing: signed-in only, DB daily cap, burst limit, honeypot, on-demand revalidation", () => {
  const api = readFileSync("src/app/api/decks/route.ts", "utf8");
  assert.match(api, /if \(!user\) return NextResponse\.json\(\{ error: "Sign in to publish a deck\." \}, \{ status: 401 \}\)/);
  assert.match(api, /prisma\.publishedDeck\.count\(/);
  assert.match(api, /rateLimit\(`deck-publish:\$\{user\.id\}`/);
  assert.match(api, /body\.website/);
  assert.match(api, /revalidatePath\("\/decks"\)/);
  const admin = readFileSync("src/app/api/admin/decks/route.ts", "utf8");
  assert.match(admin, /status: 404/);
});

test("deck pages: ISR, no build-time prewarming, SEO title, JSON-LD, sitemap", () => {
  for (const f of ["src/app/decks/page.tsx", "src/app/decks/[slug]/page.tsx", "src/app/decks/legend/[legend]/page.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /export const revalidate = 3600;/, f);
    // An EMPTY generateStaticParams is allowed (it is what makes a dynamic
    // segment ISR); one that returns params would prewarm at build.
    const gsp = /export async function generateStaticParams\(\) \{([\s\S]*?)\n\}/.exec(s);
    if (gsp) assert.match(gsp[1], /^\s*return \[\];\s*$/, f);
  }
  const page = readFileSync("src/app/decks/[slug]/page.tsx", "utf8");
  assert.match(page, /\$\{champion\(deck\.legendName\)\} deck — \$\{cost \? `\$\{cost\} to build` : deck\.title\} \| RiftCompare/);
  assert.match(page, /"@type": "CreativeWork"/);
  assert.match(page, /computeMarket\(rowsByCard\.get\(c\.id\) \?\? \[\], code\)/);
  assert.match(readFileSync("src/lib/sitemap-sections.ts", "utf8"), /\/decks\/\$\{d\.slug\}/);
  const legend = readFileSync("src/app/decks/legend/[legend]/page.tsx", "utf8");
  assert.match(legend, /Publish the first \{champ\.name\} deck/);
});

test("/deck opens on the tool: the published-deck list and builder come before the explanatory text", () => {
  const s = readFileSync("src/app/deck/page.tsx", "utf8");
  const tool = s.indexOf("<DeckBuilder");
  assert.ok(s.indexOf("Start from a published deck") < tool);
  assert.ok(s.indexOf("<HubIntro") > tool);
});

test("nothing is seeded: no deck data file ships with the repo", () => {
  const seed = readFileSync("prisma/seed.ts", "utf8");
  assert.doesNotMatch(seed, /publishedDeck/);
});
