import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { featuredSet, isPreorderSetCode, setByCode, singlesLive } from "../src/lib/constants";
import { withRadianceUpcoming } from "./helpers/upcoming-set";

// 2026-10-17 (owner: "everything needs to be tailored for Radiance now … get all
// the signatures on the database … on the very front page … feature the Radiance
// chase cards"). DECISIONS.md, "Radiance leads the site".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("featuredSet() is the upcoming set from its New day, and never names one in code", () => {
  // As Radiance was flagged before release (helpers/upcoming-set.ts).
  withRadianceUpcoming(() => {
    assert.equal(featuredSet(new Date("2026-10-01T00:00:00Z"))?.code, "VEN", "before Radiance's newFrom, the newest released set");
    assert.equal(featuredSet(new Date("2026-10-12T12:00:00Z"))?.code, "RAD", "from 12 Oct, Radiance");
    assert.equal(featuredSet(new Date("2026-10-23T12:00:00Z"))?.code, "RAD", "unchanged on release day");
  });
  // As flagged since release: the newest released set.
  assert.equal(featuredSet(new Date("2026-10-23T12:00:00Z"))?.code, "RAD", "released");
  assert.equal(featuredSet()?.code, "RAD");
  assert.match(read("src/components/EbayPicks.tsx"), /const s = featuredSet\(\);/);
});

test("every Radiance overnumbered Legend and HEARTSTEEL card has its Signature (*) printing", () => {
  const cards = JSON.parse(read("prisma/manual-cards.json")) as { setCode?: string; collectorNumber: string; name: string; externalId?: string }[];
  const rad = new Map(cards.filter((c) => c.setCode === "RAD").map((c) => [c.collectorNumber, c]));
  for (let n = 168; n <= 183; n++) {
    if (n === 177) continue; // Ekko, Revolutionary: no Signature has been shown
    const base = rad.get(`${n}/167`);
    const sig = rad.get(`${n}*/167`);
    assert.ok(base, `${n}/167 is in the catalogue`);
    assert.ok(sig, `${n}*/167 (${base?.name}) is in the catalogue`);
    assert.equal(sig!.name, base!.name);
    assert.notEqual(sig!.externalId, base!.externalId, "a Signature never upserts over its unsigned twin");
  }
});

test("the homepage strip leads with the featured set's chase cards, and Most popular is one tap away", () => {
  const carousel = read("src/components/home/PopularCardsCarousel.tsx");
  const chase = carousel.indexOf('key: "chase"');
  const popular = carousel.indexOf('key: "alltime"');
  assert.ok(chase > 0 && popular > chase, "the chase tab is first");
  assert.match(carousel, /label: `\$\{chase\.setName\} chase cards`/);
  for (const f of ["src/app/page.tsx", "src/components/home/RegionHome.tsx"]) {
    const src = read(f);
    assert.match(src, /const chaseSet = featuredSet\(\);/, f);
    assert.match(src, /getSetChaseTiles\(chaseSet\.code, 16,/, f);
  }
  const loader = read("src/lib/cheapest-cards.ts");
  assert.match(loader, /imageThumbUrl: \{ not: null \}/, "no tile without card art");
});

test("Radiance's singles are live before release day; its sealed product is still a pre-order", () => {
  const rad = setByCode("RAD")!;
  const week = new Date("2026-10-17T12:00:00Z");
  // As Radiance was flagged before release (helpers/upcoming-set.ts).
  withRadianceUpcoming(() => {
    assert.equal(singlesLive(rad, new Date("2026-10-01T00:00:00Z")), false, "not before its New day");
    assert.equal(singlesLive(rad, week), true);
    assert.equal(isPreorderSetCode("RAD", week), true, "boxes still ship on 23 Oct");
  });
  // Released: live, and not a pre-order, whatever the date.
  assert.equal(singlesLive(rad), true);
  assert.equal(isPreorderSetCode("RAD"), false);
  assert.equal(singlesLive(setByCode("VEN")!, week), true, "a released set is always live");
  const hub = read("src/app/sets/[set]/page.tsx");
  assert.match(hub, /const live = singlesLive\(set\);/);
  assert.match(hub, /\{live && totalInSet > 0 && \(/, "the price read-out shows once singles trade");
});
