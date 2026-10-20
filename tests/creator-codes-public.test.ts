import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CREATORS } from "../src/lib/content/creators";

// The creators with a creator code, on /creators (owner, 2026-10-19/20).
test("Keishun and Josh are listed with their codes, linked through their own share links", () => {
  const byCode = Object.fromEntries(CREATORS.filter((c) => c.code).map((c) => [c.code!.code, c]));
  assert.equal(byCode.KEISHUN20?.links[0].url, "https://www.instagram.com/keishun.riftbound/");
  assert.equal(byCode.JOSH20?.links[0].url, "https://www.instagram.com/ripsbyjosh/");
  for (const c of CREATORS) {
    if (!c.code) continue;
    assert.match(c.code.code, /^[A-Z0-9]{3,20}$/, "the normalised code shape (creator-affiliate-code.ts)");
    assert.doesNotMatch(c.links.map((l) => l.url).join(" "), /[?&](rpxt|psln|igsh)=/, "no share-tracking params from a pasted link");
  }
  const card = readFileSync(join(__dirname, "../src/components/creators/CreatorCard.tsx"), "utf8");
  assert.match(card, /href=\{`\/r\/\$\{creator\.code\.code\}`\}/, "through /r/CODE, which credits the creator");
});
