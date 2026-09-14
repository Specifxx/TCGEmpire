import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RADIANCE_TAGLINE,
  RADIANCE_RELEASE_DATE,
  RADIANCE_PREVIEW_START,
  RADIANCE_PREVIEW_END,
  RADIANCE_PRERIFT_START,
  RADIANCE_PRERIFT_END,
  RADIANCE_TOTAL_CARDS,
  RADIANCE_SHOWCASE_COUNT,
  RADIANCE_LEGENDS_CONFIRMED,
  RADIANCE_LEGENDS_TOTAL,
  RADIANCE_LEGENDS_UNREVEALED,
  RADIANCE_PRODUCTS,
  RADIANCE_FAQ,
} from "../src/lib/sets/radiance";
import { SETS } from "../src/lib/constants";
import { RELEASES } from "../src/lib/release-calendar";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The Radiance hub (/sets/radiance): verified facts, indexability, and the
// FAQPage JSON-LD / visible-FAQ pairing. Source-level and DB-free — RadianceHub
// itself fetches live pre-order data, which this suite has no database for, so
// these pin the parts that ARE testable without one: the data module, the
// noindex guard, and how the page wires the two together.
// ─────────────────────────────────────────────────────────────────────────────

test("the data module carries the brief's verified facts, unchanged", () => {
  assert.equal(RADIANCE_TAGLINE, "Own the Stage. The World is Watching.");
  assert.equal(RADIANCE_RELEASE_DATE, "2026-10-23");
  assert.equal(RADIANCE_PREVIEW_START, "2026-09-25");
  assert.equal(RADIANCE_PREVIEW_END, "2026-10-09");
  assert.equal(RADIANCE_PRERIFT_START, "2026-10-16");
  assert.equal(RADIANCE_PRERIFT_END, "2026-10-22");
  assert.equal(RADIANCE_TOTAL_CARDS, 180);
  assert.equal(RADIANCE_SHOWCASE_COUNT, 66);
  assert.equal(RADIANCE_LEGENDS_TOTAL, 9);
});

test("no unverified fact sneaks in — specifically no K/DA anywhere in the module", () => {
  const src = read("src/lib/sets/radiance.ts");
  assert.doesNotMatch(src, /K\/DA/i);
});

// ── The Orianna correction ──────────────────────────────────────────────────
// The brief this was built from said 5 confirmed Legends / 4 unrevealed —
// Riot's ORIGINAL Set 5 announcement. Orianna was confirmed separately, later,
// at a PAX West livestream. Pinning the corrected count (not the brief's) so a
// future edit doesn't quietly revert to the stale figure the brief shipped
// with. See src/lib/sets/radiance.ts's header for the sourcing.
test("legend count reflects Orianna's later confirmation, not the original brief's stale 5/4", () => {
  assert.equal(RADIANCE_LEGENDS_CONFIRMED.length, 6, "Seraphine, Evelynn, Ekko, Ziggs, Jarvan IV AND Orianna");
  assert.equal(RADIANCE_LEGENDS_UNREVEALED, 3);
  const names = RADIANCE_LEGENDS_CONFIRMED.map((l) => l.name);
  assert.deepEqual(names, ["Seraphine", "Evelynn", "Ekko", "Ziggs", "Jarvan IV", "Orianna"]);
  // Every legend needs a unique, URL-safe slug — it's both the chip's id
  // anchor and its query-filter link.
  const slugs = RADIANCE_LEGENDS_CONFIRMED.map((l) => l.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs must be unique");
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
});

test("release-calendar.ts's Radiance champions list carries the same correction (site-wide consistency)", () => {
  const radiance = RELEASES.find((r) => r.code === "RAD");
  assert.ok(radiance);
  assert.deepEqual(radiance!.champions, ["Seraphine", "Evelynn", "Ekko", "Ziggs", "Jarvan IV", "Orianna"]);
  assert.match(radiance!.note, /Six champion Legends/, "the note's own wording must agree with the list length");
});

test("the Showdown Deck fact matches the brief exactly: two 56-card decks, two boosters, two playmats, one rulebook, $34.99", () => {
  const deck = RADIANCE_PRODUCTS.find((p) => p.name.includes("Showdown Decks"));
  assert.ok(deck);
  assert.equal(deck!.msrp, "$34.99");
  assert.match(deck!.detail ?? "", /Two 56-card/);
  assert.match(deck!.detail ?? "", /two booster packs/i);
  assert.match(deck!.detail ?? "", /two playmats/i);
  assert.match(deck!.detail ?? "", /1 rulebook/i);
});

test("the FAQ has exactly 6 entries, each self-consistent with the data module", () => {
  assert.equal(RADIANCE_FAQ.length, 6);
  const legendsFaq = RADIANCE_FAQ.find((f) => /which champions/i.test(f.q));
  assert.ok(legendsFaq);
  assert.match(legendsFaq!.a, /Six legends are confirmed/);
  assert.match(legendsFaq!.a, /Orianna/);
  assert.match(legendsFaq!.a, /three more unrevealed/);
  const cardCountFaq = RADIANCE_FAQ.find((f) => /how many cards/i.test(f.q));
  assert.ok(cardCountFaq);
  assert.match(cardCountFaq!.a, /180 cards/);
  assert.match(cardCountFaq!.a, /66 Showcase/);
});

// ── Indexability guard ──────────────────────────────────────────────────────
test("Radiance is flagged hubReady, and it is the only comingSoon set that is", () => {
  const radiance = SETS.find((s) => s.slug === "radiance");
  assert.ok(radiance);
  assert.equal(radiance!.hubReady, true);
  const otherComingSoonWithHub = SETS.filter((s) => s.slug !== "radiance" && s.comingSoon && s.hubReady);
  assert.deepEqual(otherComingSoonWithHub, [], "no other set should be indexable-while-empty by accident");
});

test("the noindex guard flips ONLY for a hubReady set — every other empty set stays noindexed", () => {
  const src = read("src/app/sets/[set]/page.tsx");
  assert.match(
    src,
    /\(cardCount === 0 && !set\.hubReady\) \|\| filtered/,
    "cardCount === 0 must still noindex unless the set is explicitly hubReady",
  );
});

test("FAQPage JSON-LD is emitted only for radiance, from the same RADIANCE_FAQ array the visible FAQ renders", () => {
  const src = read("src/app/sets/[set]/page.tsx");
  assert.match(src, /set\.slug === "radiance" \? faqPage\(RADIANCE_FAQ\) : null/);
  assert.match(src, /breadcrumb, collection, \.\.\.\(faqLd \? \[faqLd\] : \[\]\)/);
});

test("RadianceHub renders the identical RADIANCE_FAQ array via the shared HubFaq component (native <details>)", () => {
  const src = read("src/components/sets/RadianceHub.tsx");
  assert.match(src, /<HubFaq faqs=\{RADIANCE_FAQ\}/);
  const hubFaqSrc = read("src/components/HubFaq.tsx");
  assert.match(hubFaqSrc, /<details/, "must be native <details>, not a client-side accordion");
  assert.doesNotMatch(hubFaqSrc, /"use client"/);
});

test("every confirmed legend is a real chip with an id anchor and a link into the filtered card view", () => {
  const src = read("src/components/sets/RadianceHub.tsx");
  assert.match(src, /id=\{legend\.slug\}/);
  assert.match(src, /href=\{`\/sets\/radiance\?q=\$\{encodeURIComponent\(legend\.name\)\}`\}/);
  assert.match(src, /\+\{RADIANCE_LEGENDS_UNREVEALED\} unrevealed/);
});

test("the release timeline is pinned to the real dates, not typed a second time", () => {
  const src = read("src/components/sets/RadianceHub.tsx");
  for (const constName of [
    "RADIANCE_PREVIEW_START",
    "RADIANCE_PREVIEW_END",
    "RADIANCE_PRERIFT_START",
    "RADIANCE_PRERIFT_END",
    "RADIANCE_RELEASE_DATE",
  ]) {
    assert.ok(src.includes(constName), `timeline must reference ${constName} rather than a literal date`);
  }
});

test("RadianceHub is wired into the set page and renders regardless of card count", () => {
  const src = read("src/app/sets/[set]/page.tsx");
  const hubAt = src.indexOf('{set.slug === "radiance" && <RadianceHub');
  const gridAt = src.indexOf("{totalInSet === 0 ? (");
  assert.ok(hubAt > 0 && gridAt > hubAt, "the hub must render BEFORE the totalInSet branch, not nested inside it");
});

// ── Pre-order table extraction (task 3: reuse an existing component) ───────
test("the pre-order price table is a single shared component, used by both /radiance-preorders and the hub", () => {
  const preordersPage = read("src/app/radiance-preorders/page.tsx");
  assert.match(preordersPage, /import \{ PreorderPriceTable, pricedPreorderGroups \} from "@\/components\/PreorderPriceTable"/);
  assert.match(preordersPage, /<PreorderPriceTable groups=\{priced\} country=\{country\} currency=\{currency\} \/>/);
  // The old inline per-store <li> markup must be gone from the page now that
  // it lives in the shared component — otherwise there are two copies to drift.
  assert.doesNotMatch(preordersPage, /rows\.map\(\(l\) => \{/);

  const hub = read("src/components/sets/RadianceHub.tsx");
  assert.match(hub, /<PreorderPriceTable groups=\{priced\} country=\{country\} currency=\{currency\} \/>/);
});

test("PreorderPriceTable never claims InStock — every listing here is unshipped", () => {
  const src = read("src/components/PreorderPriceTable.tsx");
  assert.match(src, /pre-order/i);
  assert.doesNotMatch(src, /InStock/);
});

// ── OG image ─────────────────────────────────────────────────────────────
test("every set page (including Radiance) resolves a real per-set OG image, not the bare sitewide default", () => {
  const src = read("src/app/sets/[set]/opengraph-image.tsx");
  assert.match(src, /export default async function Image/);
  assert.match(src, /setBySlug\(params\.set\)/);
  assert.match(src, /export const size = \{ width: 1200, height: 630 \}/);
});

test("no test-of-record still expects a stale 5-confirmed/4-unrevealed Radiance legend count", () => {
  // Guards against a future edit reintroducing the brief's original figure
  // anywhere it might get re-typed (a new blog post, a new hub module).
  const src = read("src/components/sets/RadianceHub.tsx");
  assert.doesNotMatch(src, /\+4 unrevealed/);
});
