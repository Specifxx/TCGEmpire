import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatCanary,
  galleryCardsFrom,
  nextDataFromHtml,
  planBackfill,
  rulesFromAlt,
  type DbCardText,
} from "../scripts/backfill-card-text";

// ─────────────────────────────────────────────────────────────────────────────
// scripts/backfill-card-text.ts fills Card.description for OGN/OGS/SFD/UNL from
// Riot's gallery. These fixtures are real gallery objects (trimmed to the fields
// the script reads), copied from playriftbound.com/en-us/card-gallery/ on
// 2026-09-25.
// ─────────────────────────────────────────────────────────────────────────────

const gal = (o: {
  id: string; name: string; subtitle?: string; set: string; code: string; type: string; tags?: string[]; alt: string;
}) => ({
  id: o.id,
  name: o.name,
  ...(o.subtitle ? { subtitle: o.subtitle } : {}),
  set: { label: "Card Set", value: { id: o.set } },
  cardType: { type: o.type ? [{ label: o.type }] : [] },
  publicCode: o.code,
  cardImage: { url: "https://cmsassets.rgpub.io/x.png", accessibilityText: o.alt },
  ...(o.tags ? { tags: { tags: o.tags } } : {}),
});

const NEXT_DATA = {
  props: {
    pageProps: {
      page: {
        blades: [
          {
            cards: {
              items: [
                gal({
                  id: "ven-021-166", name: "Akali", subtitle: "Deadly Weapon", set: "VEN", code: "VEN-021/166", type: "Unit", tags: ["Ionia", "Akali"],
                  alt: "Riftbound Unit: Akali, Deadly Weapon. [Empower] [2][C] ([2][C]: Empower me. Use only if not Empowered.)\nWhen I move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead.\n[Empowered][>] I have +1 [S].",
                }),
                gal({
                  id: "ogn-251-298", name: "Loose Cannon", set: "OGN", code: "OGN-251/298", type: "Legend", tags: ["Jinx"],
                  alt: "Riftbound Legend: Loose Cannon. At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand.",
                }),
                gal({
                  id: "ogn-001-298", name: "Blazing Scorcher", set: "OGN", code: "OGN-001/298", type: "Unit", tags: ["Dragon", "Noxus"],
                  alt: "Riftbound Unit: Blazing Scorcher. [Accelerate] (You may pay [1][C] as an additional cost to have me enter ready.)",
                }),
                gal({
                  id: "unl-057-219", name: "Alpha Wildclaw", set: "UNL", code: "UNL-057/219", type: "Unit",
                  alt: "Riftbound Unit: Alpha Wildclaw. [Tank] (I must be assigned combat damage first.)\nYour units here with less Might than me can't be chosen by enemy spells and abilities.",
                }),
                gal({
                  id: "ogn-109-298", name: "Dr. Mundo", subtitle: "Expert", set: "OGN", code: "OGN-109/298", type: "Unit", tags: ["Dr. Mundo"],
                  alt: "Riftbound Unit: Dr. Mundo, Expert. My Might is increased by the number of cards in your trash.",
                }),
                gal({
                  id: "ogn-248-298", name: "Icathian Rain", subtitle: "Kai'Sa", set: "OGN", code: "OGN-248/298", type: "Spell", tags: ["Kai'Sa"],
                  alt: "Riftbound Spell: Icathian Rain, Kai'Sa. Deal 2 to a unit.",
                }),
                gal({
                  id: "ogn-066a-298", name: "Ahri", subtitle: "Alluring", set: "OGN", code: "OGN-066a/298", type: "Unit", tags: ["Ahri", "Ionia"],
                  alt: "Riftbound Unit: Ahri, Alluring. When I hold, you score 1 point.",
                }),
              ],
            },
          },
        ],
      },
    },
  },
};

const HTML = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(NEXT_DATA)}</script></body></html>`;
const GALLERY = galleryCardsFrom(nextDataFromHtml(HTML));
const OLD_SETS = GALLERY.filter((g) => g.setCode !== "VEN");

const row = (o: Partial<DbCardText> & { externalId: string; name: string; collectorNumber: string }): DbCardText => ({
  id: `id-${o.externalId}`,
  description: null,
  ...o,
});

test("the gallery parser reads name + subtitle, set and bracket-format text", () => {
  assert.equal(GALLERY.length, 7);
  const akali = GALLERY.find((g) => g.id === "ven-021-166")!;
  assert.equal(akali.name, "Akali, Deadly Weapon");
  assert.equal(akali.setCode, "VEN");
  assert.ok(akali.text!.startsWith("[Empower] [2][C]"));
  // A full stop inside the name must not be mistaken for the end of it.
  assert.equal(GALLERY.find((g) => g.id === "ogn-109-298")!.text, "My Might is increased by the number of cards in your trash.");
});

test("bracket-format normalisation reproduces the stored Vendetta text exactly", () => {
  // The Vendetta rows were imported by fetch-set-official.ts from the same
  // accessibility text, with the markers left in brackets. Every lib/keywords.ts
  // predicate reads that format, so the backfill must produce it byte for byte.
  const stored =
    "[Empower] [2][C] ([2][C]: Empower me. Use only if not Empowered.)\nWhen I move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead.\n[Empowered][>] I have +1 [S].";
  const ven = [row({ externalId: "ven-021-166", name: "Akali, Deadly Weapon", collectorNumber: "021/166", description: stored })];
  const c = formatCanary(ven, GALLERY);
  assert.equal(c.compared, 1);
  assert.equal(c.equal, 1);
  assert.ok(!c.ok, "one row is too few to trust — the canary needs a real sample");

  // The importer's own "ven-official-<id>" keying resolves too.
  const many = Array.from({ length: 25 }, () => ({ ...ven[0], externalId: "ven-official-ven-021-166" }));
  assert.ok(formatCanary(many, GALLERY).ok);

  // …and a format change (say, icons rendered as :rb_rune_fury:) fails it.
  const drifted = many.map((r) => ({ ...r, description: r.description!.replace("[C]", ":rb_rune_chaos:") }));
  const bad = formatCanary(drifted, GALLERY);
  assert.equal(bad.ok, false);
  assert.equal(bad.diffs.length, 25);
});

test("an exact externalId match with agreeing name and number is filled", () => {
  const plan = planBackfill([row({ externalId: "ogn-001-298", name: "Blazing Scorcher", collectorNumber: "001/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].text, "[Accelerate] (You may pay [1][C] as an additional cost to have me enter ready.)");
});

test("a Legend matches under the catalogue's 'Champion, Epithet' name", () => {
  const plan = planBackfill([row({ externalId: "ogn-251-298", name: "Jinx, Loose Cannon", collectorNumber: "251/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 1);
});

test("a champion's signature card matches under its bare stored name", () => {
  // The gallery names it "Icathian Rain" with subtitle "Kai'Sa" (the champion
  // tag); RiftScribe stores "Icathian Rain".
  const plan = planBackfill([row({ externalId: "ogn-248-298", name: "Icathian Rain", collectorNumber: "248/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.nameMismatch.length, 0);
});

test("a bare champion name does not match a unit whose subtitle is an epithet", () => {
  const plan = planBackfill([row({ externalId: "ogn-109-298", name: "Dr. Mundo", collectorNumber: "109/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.nameMismatch.length, 1);
});

test("an alt-art matches on its lettered number", () => {
  const plan = planBackfill([row({ externalId: "ogn-066a-298", name: "Ahri, Alluring", collectorNumber: "066a/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 1);
});

test("a name mismatch is reported and never written", () => {
  const plan = planBackfill([row({ externalId: "ogn-001-298", name: "Some Other Card", collectorNumber: "001/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.nameMismatch.length, 1);
});

test("a collector-number mismatch is reported and never written", () => {
  const plan = planBackfill([row({ externalId: "ogn-001-298", name: "Blazing Scorcher", collectorNumber: "002/298" })], OLD_SETS);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.collectorMismatch.length, 1);
});

test("a promo sharing its base card's name and number is not matched by them", () => {
  // TCGplayer-created promo rows carry "tcg-<productId>" and the base card's
  // collector number. There is no fuzzy fallback, so the promo is reported as
  // unmatched rather than guessed at — and the base still fills exactly once.
  const plan = planBackfill(
    [
      row({ externalId: "ogn-001-298", name: "Blazing Scorcher", collectorNumber: "001/298" }),
      row({ externalId: "tcg-678049", name: "Blazing Scorcher", collectorNumber: "001/298" }),
    ],
    OLD_SETS,
  );
  assert.deepEqual(plan.updates.map((u) => u.card.externalId), ["ogn-001-298"]);
  assert.deepEqual(plan.unmatched.map((u) => u.externalId), ["tcg-678049"]);
});

test("a row that already has text is left untouched", () => {
  const plan = planBackfill(
    [row({ externalId: "unl-057-219", name: "Alpha Wildclaw", collectorNumber: "057/219", description: "hand-corrected text" })],
    OLD_SETS,
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.alreadyFilled, 1);
});

test("a card that prints no text is never given an empty string", () => {
  assert.equal(rulesFromAlt("Riftbound Rune: Fury Rune. [NO TEXT]", "Fury Rune"), null);
  assert.equal(rulesFromAlt("Riftbound Rune: Fury Rune.", "Fury Rune"), null);
});

test("the script is dry-run by default and writes fill-only", () => {
  const src = readFileSync(join(process.cwd(), "scripts/backfill-card-text.ts"), "utf8");
  assert.match(src, /process\.argv\.includes\("--apply"\) && process\.env\.DRY_RUN !== "1"/);
  assert.match(src, /where: \{ id: u\.card\.id, description: null \}/, "the UPDATE must re-check NULL, not trust the earlier read");
  assert.doesNotMatch(src, /prisma\.card\.(create|upsert|createMany)\(/, "the backfill must never create rows");
  assert.match(src, /never dispatch maintenance\.yml's `set-pipeline`/i);
});

test("maintenance.yml runs it report-only unless apply is ticked, and purges only after a write", () => {
  const wf = readFileSync(join(process.cwd(), ".github/workflows/maintenance.yml"), "utf8");
  assert.match(wf, /- backfill-card-text\b/);
  assert.match(wf, /npx tsx scripts\/backfill-card-text\.ts \$\{\{ inputs\.apply && '--apply' \|\| '' \}\}/);
  const ping = wf.slice(wf.indexOf("- name: Revalidate sitemap + ping IndexNow for new cards"));
  const cond = ping.slice(0, ping.indexOf("env:"));
  assert.ok(cond.includes('"backfill-card-text"'), "a filled backfill must purge the card pages it changed");
  assert.match(cond, /inputs\.task != 'backfill-card-text' \|\| \(inputs\.apply && success\(\)\)/, "a report-only or refused run must not purge ~1,400 card pages");
});
