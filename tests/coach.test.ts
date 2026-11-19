import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { coachMessage, isFounderTap, parseCoachRequest, COACH_SOURCE } from "../src/lib/coach";

// Deck Coach test (DECISIONS.md "Deck Coach test", 2026-11-19).
const read = (p: string) => readFileSync(p, "utf8");

test("the /coach page is hidden: noindex, nofollow, static", () => {
  const page = read("src/app/coach/page.tsx");
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.doesNotMatch(page, /cookies\(|headers\(|@\/lib\/db|force-dynamic/);
});

test("the sitemap never lists /coach", () => {
  for (const f of ["src/app/sitemap.xml/route.ts", "src/lib/sitemap.ts"]) {
    try {
      assert.doesNotMatch(read(f), /["'`]\/coach/);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
});

test("requests are private feedback rows and notify the owner", () => {
  const route = read("src/app/api/coach/route.ts");
  assert.match(route, /consentPublic:\s*false/);
  assert.match(route, /notifyOwnerBounded\(/);
  assert.doesNotMatch(route, /anthropic|rating:/i);
  assert.equal(COACH_SOURCE, "coach");
});

test("the admin queue needs an admin session", () => {
  assert.match(read("src/app/admin/coach/page.tsx"), /if \(!user\?\.isAdmin\) notFound\(\)/);
});

test("parse and message", () => {
  assert.equal(parseCoachRequest({ deck: "short" }), null);
  const r = parseCoachRequest({ deck: "1 Kennen, Heart of the Tempest\n3 Lightning Rush", budget: "bogus", founder: true });
  assert.ok(r);
  assert.equal(r.budget, "No limit");
  const m = coachMessage(r);
  assert.ok(isFounderTap(m));
  assert.ok(!isFounderTap(coachMessage({ ...r, founder: false })));
});
