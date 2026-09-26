import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { AUTHORS, ARTICLE_PROCESS, authorByName, authorJsonLd } from "../src/lib/content/authors";

// Bylines (owner decision, 2026-09-26, "Blog and tools, joined up" in
// DECISIONS.md). Ten articles were bylined "Bill" and three "RiftCompare
// Markets Desk", and neither was registered: both rendered unlinked, and
// authorJsonLd typed a person's first name as an Organization. The owner then
// confirmed who Bill is and how articles are made, and the registry now says
// exactly that — no more, since nothing else about him is on record.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const bill = authorByName("Bill");

test("every published article's byline resolves to a registered author", () => {
  const unregistered = getArticles()
    .filter((a) => !authorByName(a.author))
    .map((a) => `${a.slug}: "${a.author}"`);
  assert.deepEqual(unregistered, [], `bylines with no entry in lib/content/authors.ts:\n  ${unregistered.join("\n  ")}`);
});

test("every registered author has published work, so no author page is empty", () => {
  for (const a of AUTHORS) {
    assert.ok(getArticles().some((x) => x.author === a.name), `${a.name} has no published article`);
  }
});

test("Bill is a Person, in the registry and in every article's JSON-LD", () => {
  assert.ok(bill, "Bill must be registered");
  assert.equal(bill!.slug, "bill");
  assert.equal(bill!.type, "Person");
  assert.equal(bill!.role, "Founder — builds and runs RiftCompare");
  const ld = authorJsonLd("Bill") as Record<string, unknown>;
  assert.equal(ld["@type"], "Person");
  assert.match(String(ld["@id"]), /\/authors\/bill#author$/);
  assert.equal(authorJsonLd("RiftCompare")["@type"], "Organization", "the site byline is the site, not a person");
});

test("both bios carry the owner's statement of how articles are made, verbatim", () => {
  assert.equal(
    ARTICLE_PROCESS,
    "Articles are drafted with AI assistance, then edited and fact-checked by Bill before publishing; prices and figures come from RiftCompare's own price database, never from the draft.",
  );
  for (const a of AUTHORS) assert.ok(a.bio.some((p) => p.includes(ARTICLE_PROCESS)), `${a.name}'s bio`);
  assert.match(read("src/app/authors/page.tsx"), /\{ARTICLE_PROCESS\}/, "/authors states it too, from the same constant");
});

test("Bill's bio says only what is on record, and links the real way to report a mistake", () => {
  const text = bill!.bio.join(" ");
  assert.match(text, /builds and runs it on his own/);
  assert.match(text, /editorial calls/);
  // No invented identity: no surname, place, credentials or history.
  assert.doesNotMatch(text, /\b(years?|experience|based in|degree|certified|veteran|since 20\d\d)\b/i);
  // The two routes that take a correction: the card page's report link (its
  // button text, quoted) and the contact form.
  assert.match(text, /Spotted a wrong price\? Report it/);
  assert.match(read("src/components/ReportPriceButton.tsx"), /Spotted a wrong price\? Report it/);
  assert.match(text, /\[contact form\]\(\/contact\)/);
  assert.ok(existsSync(join(ROOT, "src/app/contact/page.tsx")));
});

test("the first bio paragraph is plain text: it is the card, the meta description and the JSON-LD", () => {
  for (const a of AUTHORS) assert.doesNotMatch(a.bio[0], /\]\(/, `${a.name}: move the link out of bio[0]`);
  const page = read("src/app/authors/[slug]/page.tsx");
  assert.match(page, /\{withLinks\(p\)\}/, "later paragraphs render their links");
  assert.match(page, /author\.bio\.map\(plainIntroText\)/, "and the JSON-LD gets their plain text");
});

test("the site byline's bio is current: six markets, and nothing unverifiable", () => {
  const site = authorByName("RiftCompare")!;
  const text = site.bio.join(" ");
  assert.match(text, /six markets: Australia, the United States, the United Kingdom, Singapore, Canada and the EU/);
  assert.doesNotMatch(text, /since the game launched/, "the repo cannot show that");
  assert.doesNotMatch(text, /written by the people who run/, "one person runs the site");
  assert.match(text, /edited by Bill/);
});

test("/authors describes the registry as it is", () => {
  const src = read("src/app/authors/page.tsx");
  assert.doesNotMatch(src, /kept separate on purpose/);
  assert.doesNotMatch(src, /generated directly from our price database/);
  assert.doesNotMatch(src, /a named person starts writing/);
  assert.match(src, /built and run by one person/);
  assert.equal(AUTHORS.length, 2, "the copy names two bylines — update it with the registry");
});
