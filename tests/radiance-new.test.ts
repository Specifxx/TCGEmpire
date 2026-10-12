import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPreorderSetCode, nextUpcomingSet, newestReleasedSet, pricePrioritySetCodes, setByCode, showsAsNew } from "../src/lib/constants";

// Radiance is shown as "New" from 12 Oct 2026, when Riot's gallery had its list
// (owner: "radiance is now new and not coming soon"), but stays a pre-order set
// until its 23 Oct street date (DECISIONS.md, "Radiance is shown as new").
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const RAD = setByCode("RAD")!;
const ON = new Date("2026-10-12T09:00:00Z");

test("Radiance wears the New badge from newFrom, and nothing else moves before the street date", () => {
  assert.equal(showsAsNew(RAD, new Date("2026-10-11T23:59:00Z")), false);
  assert.equal(showsAsNew(RAD, ON), true);
  assert.equal(showsAsNew(setByCode("VEN")!, ON), false, "Vendetta is no longer new");
  // Display only: pre-orders, the countdown, the newest released set and the eBay quota keep the date.
  assert.equal(RAD.comingSoon, true);
  assert.equal(isPreorderSetCode("RAD", ON), true);
  assert.equal(nextUpcomingSet(ON)?.code, "RAD");
  assert.equal(newestReleasedSet(ON)?.code, "VEN");
  assert.deepEqual(pricePrioritySetCodes(ON), []);
});

test("the homepage tile, the sets index and the share image read showsAsNew", () => {
  const home = read("src/components/home/HomeSections.tsx");
  assert.match(home, /s\.comingSoon && !s\.sealedAvailable && !showsAsNew\(s\)/, "a new pre-release set is not a Coming soon tile");
  assert.match(home, /\(s\.comingSoon && s\.sealedAvailable\) \|\| showsAsNew\(s\)/);
  assert.match(read("src/app/sets/page.tsx"), /showsAsNew\(s\) \? " · new"/);
  assert.match(read("src/app/sets/[set]/opengraph-image.tsx"), /showsAsNew\(set\) \? "New set" : "Coming soon"/);
});

test("past the announced total the count stands alone, never '197 of 180'", () => {
  assert.match(read("src/app/sets/[set]/page.tsx"), /revealed >= announced \? `\$\{revealed\} Cards` : `\$\{revealed\} of \$\{announced\}`/);
  assert.match(read("src/components/sets/RadianceReveals.tsx"), /data\.revealed >= RADIANCE_TOTAL_CARDS \?/);
  assert.match(read("src/app/sets/[set]/gallery/page.tsx"), /preview && announced && total < announced \? `of \$\{announced\} cards so far`/);
});
