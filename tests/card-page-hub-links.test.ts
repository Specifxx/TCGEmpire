import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETS, hasSetHub, setByCode } from "../src/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// A REVEALED CARD FROM AN UNRELEASED SET LINKS TO ITS SET HUB, NOT /browse.
// ─────────────────────────────────────────────────────────────────────────────
// card/[id]/page.tsx sent every comingSoon set to /browse — a rule written two
// days before `hubReady` existed. So every Radiance card page had a breadcrumb
// to /browse, no set crumb in its BreadcrumbList, "View all" and the gallery
// link to /browse, and no link at all to the spoiler tracker, while
// /sets/radiance was an indexable hub owning "riftbound radiance card list".
// hasSetHub() is the one predicate for "does /sets/<slug> deserve a link".
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = readFileSync(join(process.cwd(), "src/app/card/[id]/page.tsx"), "utf8");

test("hasSetHub: released sets and hub-ready pre-release sets, nothing else", () => {
  assert.equal(hasSetHub({ code: "X", name: "X", slug: "x" }), true);
  assert.equal(hasSetHub({ code: "X", name: "X", slug: "x", comingSoon: true }), false);
  assert.equal(hasSetHub({ code: "X", name: "X", slug: "x", comingSoon: true, hubReady: true }), true);
  for (const s of SETS) if (!s.comingSoon) assert.ok(hasSetHub(s), `${s.code} is released and must keep its set links`);
  // Radiance is the set this was written for; it is removed from comingSoon on
  // release, at which point the first loop covers it instead.
  const rad = setByCode("RAD");
  if (rad?.comingSoon) assert.ok(hasSetHub(rad), "Radiance has a real hub and must link it");
});

test("the set URL and the gallery link use hasSetHub, not !comingSoon", () => {
  assert.match(PAGE, /const setUrl = setInfo && hasSetHub\(setInfo\) \? `\/sets\/\$\{setInfo\.slug\}` : "\/browse";/);
  // The JSON-LD set crumb hangs off setUrl, so it comes back with it.
  assert.match(PAGE, /const hasSetPage = setUrl !== "\/browse";/);
  assert.match(PAGE, /setInfo && hasSetHub\(setInfo\) \? \(\s*<Link href=\{`\/sets\/\$\{setInfo\.slug\}\/gallery`\}/);
  assert.ok(!/setInfo && !setInfo\.comingSoon \?/.test(PAGE), "no set link may still gate on !comingSoon alone");
});

test("the sealed chip stays on !comingSoon; an unreleased set links its pre-orders instead", () => {
  // /sealed?set=<code> is empty for a pre-order set — getSealedGroups excludes
  // them — so hasSetHub would have linked a blank page.
  assert.match(PAGE, /setInfo && !setInfo\.comingSoon && \(\s*<Link href=\{`\/sealed\?set=\$\{card\.setCode\}`\}/);
  assert.match(PAGE, /const preordersHref = preordersHrefForSet\(card\.setCode\);/);
  assert.match(PAGE, /setInfo\?\.comingSoon && preordersHref && \(\s*<Link href=\{preordersHref\}/);
});

test("the preview row links the tracker, set hub and pre-orders, each only while live", () => {
  assert.match(PAGE, /const spoilersHref = spoilersHrefForSet\(card\.setCode\);/);
  assert.match(PAGE, /const preview = isPreorderSetCode\(card\.setCode\);/);
  assert.match(PAGE, /\{spoilersHref && \(\s*<Link href=\{spoilersHref\}/);
  // Set-agnostic: the card template names no set and no set-specific URL.
  assert.ok(!/\/radiance-preorders|riftbound-radiance-spoilers|"RAD"/.test(PAGE), "the card template must not hardcode a set");
});

test("no four-market list survives on the card page", () => {
  assert.ok(!/AU, US, UK & SG/.test(PAGE), 'the "AU, US, UK & SG" description predates CA and EU');
  assert.ok(!/AU, US, UK and SG stores/.test(PAGE));
  assert.match(PAGE, /Revealed for Riftbound \$\{card\.setName\}; live prices from \$\{unreleasedOn\}\./);
});
