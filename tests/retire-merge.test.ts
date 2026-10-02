import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// scripts/add-manual-cards.ts retires printings Riot's sources show do not
// exist. The first production run KEPT the unsigned Seraphine 174/167 because
// user rows pointed at it, so the gallery showed 85 cards against Riot's 84
// (2026-09-30). The fix merges those rows into the printing the card really
// was, then deletes it. Rehearsed against a local database (dry run, real run,
// re-run, clash); these pin the shape so the safety rules cannot erode.

const src = readFileSync(join(process.cwd(), "scripts/add-manual-cards.ts"), "utf8");
const manual = JSON.parse(readFileSync(join(process.cwd(), "prisma/manual-cards.json"), "utf8")) as { externalId?: string }[];

test("every mergeInto names a card this file still catalogues", () => {
  const ids = new Set(manual.map((c) => c.externalId).filter(Boolean));
  for (const [, t] of src.matchAll(/mergeInto: "([^"]+)"/g)) assert.ok(ids.has(t), `${t} must be a live row in manual-cards.json`);
});

// The one retirement this was built for was wrong (2026-10-02): Riot's image
// for RAD-174/167 is the unsigned printing, so the row is back and must not
// be retired or merged again, and its URL must not redirect to 174*.
test("the unsigned Seraphine 174 is a live row, not a retirement", () => {
  const retired = src.slice(src.indexOf("const RETIRED"), src.indexOf("];", src.indexOf("const RETIRED")));
  assert.doesNotMatch(retired, /externalId: "spoiler-rad-174-seraphine/);
  assert.ok(manual.some((c) => c.externalId === "spoiler-rad-174-seraphine-starry-eyed-songstress"));
  const renames = readFileSync(join(process.cwd(), "src/lib/card-slug-renames.ts"), "utf8");
  assert.doesNotMatch(renames, /"seraphine-starry-eyed-songstress-rad-174-167":/);
});

test("the merge moves every user table, and deletes only inside the same transaction", () => {
  const merge = src.slice(src.indexOf("async function mergeCard"), src.indexOf("async function retire"));
  for (const t of ["priceAlert", "collectionCard", "listing", "buyOrder", "marketplaceListing", "priceReport", "setReleaseAlert", "publishedDeck"]) {
    assert.match(merge, new RegExp(`tx\\.${t}\\.update`), `${t} rows must move to the target`);
  }
  assert.match(merge, /await prisma\.\$transaction\(\s*async \(tx\) =>[\s\S]*tx\.card\.delete\(/, "the delete is the transaction's last step");
  assert.doesNotMatch(merge, /prisma\.card\.delete/, "never a delete outside the transaction");
  assert.match(merge, /if \(DRY\) return;/, "a dry run writes nothing");
  // A published deck can use the card as its Legend as well as in its list.
  assert.match(merge, /legendCardId: d\.legendCardId === from\.id \? to\.id : d\.legendCardId/);
});

test("a clash under any unique key keeps the card instead of choosing between someone's rows", () => {
  const retire = src.slice(src.indexOf("async function retire"));
  assert.match(retire, /const clashes = await mergeClashes\(card\.id, target\.id\);\s*if \(clashes\.length\) \{\s*console\.log\(`KEEP/);
  const clash = src.slice(src.indexOf("async function mergeClashes"), src.indexOf("async function mergeCard"));
  // PriceAlert @@unique([email, cardId, market]), CollectionCard
  // @@unique([userId, cardId, condition, isFoil]), SetReleaseAlert
  // @@unique([email, setCode, scope]).
  assert.match(clash, /email: a\.email, market: a\.market/);
  assert.match(clash, /userId: h\.userId, condition: h\.condition, isFoil: h\.isFoil/);
  assert.match(clash, /email: s\.email, setCode: s\.setCode/);
  // The log is a CI log: counts only.
  assert.doesNotMatch(src.slice(src.indexOf("async function mergeCard")), /console\.log\([^)]*\.email/);
});
