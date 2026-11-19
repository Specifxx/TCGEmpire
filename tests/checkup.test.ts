import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkupCors, checkupMessage, checkupSiteFor, isFounderTick, parseCheckup, CHECKUP_SOURCE } from "../src/lib/checkup";

// Collection check-up test (DECISIONS.md "Collection check-up test", 2026-11-19).
const read = (p: string) => readFileSync(p, "utf8");
const items = (n: number) => Array.from({ length: n }, (_, i) => `1x Card ${i} (OGN ${i})`);

test("only the sister sites' exact https origins may post", () => {
  assert.equal(checkupSiteFor("https://mtgcompare.app"), "mtg");
  assert.equal(checkupSiteFor("https://www.opcompare.app"), "op");
  assert.equal(checkupSiteFor("https://dexcompare.io"), "dex");
  assert.equal(checkupSiteFor("http://mtgcompare.app"), null);
  assert.equal(checkupSiteFor("https://mtgcompare.app.evil.com"), null);
  assert.equal(checkupSiteFor("https://riftcompare.com"), null);
  assert.equal(checkupSiteFor(null), null);
  assert.equal(checkupCors("https://evil.com")["Access-Control-Allow-Origin"], undefined);
  assert.equal(checkupCors("https://mtgcompare.app")["Access-Control-Allow-Origin"], "https://mtgcompare.app");
});

test("a check-up needs 10 items, and the founder tick is read back", () => {
  assert.equal(parseCheckup({ items: items(9) }), null);
  const r = parseCheckup({ items: items(12), founder: true, market: "US" });
  assert.ok(r);
  assert.equal(r.items.length, 12);
  assert.ok(isFounderTick(checkupMessage("mtg", r)));
  assert.ok(!isFounderTick(checkupMessage("mtg", { ...r, founder: false })));
  assert.equal(parseCheckup({ items: items(1000) })!.items.length, 400);
});

test("requests are private rows, notify the owner, and never call a model", () => {
  const route = read("src/app/api/checkup/route.ts");
  assert.match(route, /consentPublic:\s*false/);
  assert.match(route, /notifyOwnerBounded\(/);
  assert.match(route, /sister \? null : await getCurrentUser\(\)/, "a cross-origin request never reads Rift's session");
  assert.doesNotMatch(route, /anthropic|rating:/i);
  assert.equal(CHECKUP_SOURCE, "checkup");
});

test("the admin queue needs an admin session", () => {
  assert.match(read("src/app/admin/checkups/page.tsx"), /if \(!user\?\.isAdmin\) notFound\(\)/);
});
