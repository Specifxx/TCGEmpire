import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMAIN_KEYS } from "../src/lib/constants";

const ROOT = process.cwd();
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

type Manual = Record<string, unknown> & { _note?: string };

const ALL: Manual[] = readJson("prisma/manual-cards.json");
// A bare { "_note": … } row is documentation, not a card.
const CARDS = ALL.filter((e) => !(Object.keys(e).length === 1 && "_note" in e));

// ─────────────────────────────────────────────────────────────────────────────
// prisma/manual-cards.json is the one card source a human types BY HAND — every
// other printing arrives through an importer that reads an upstream feed. It is
// therefore the only place a card can enter the catalogue with an invented
// collector number, a misspelt domain or a made-up stat line, and nothing
// checked it before this file existed. add-manual-cards.ts refuses an entry
// with a FILL_ME or a missing required field at RUN time, in CI, against the
// production database; that is far too late to learn the entry was wrong.
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors scripts/add-manual-cards.ts's own REQUIRED list.
const REQUIRED = ["name", "setCode", "setName", "collectorNumber", "domain", "type", "rarity"] as const;

test("every hand-written card entry is complete and nothing is a placeholder", () => {
  for (const c of CARDS) {
    const who = String(c.externalId ?? `${c.setCode} ${c.collectorNumber} ${c.name}`);
    for (const k of REQUIRED) {
      const v = c[k];
      assert.ok(v != null && String(v).trim() !== "", `${who}: missing "${k}"`);
      assert.ok(!String(v).includes("FILL_ME"), `${who}: "${k}" is still a placeholder`);
    }
    // add-manual-cards skips a FILL_ME image too — a skipped entry is a card
    // that silently never appears, which reads exactly like "we don't have it".
    assert.ok(!String(c.imageUrl ?? "").includes("FILL_ME"), `${who}: imageUrl is still a placeholder`);
  }
});

test("domains are real domains, not near-misses", () => {
  // A typo here doesn't fail the import — it writes a card into a domain filter
  // that matches nothing, so the card is in the catalogue and unreachable.
  for (const c of CARDS) {
    assert.ok(
      DOMAIN_KEYS.includes(c.domain as (typeof DOMAIN_KEYS)[number]),
      `${c.name} ${c.collectorNumber}: "${c.domain}" is not one of ${DOMAIN_KEYS.join(", ")}`,
    );
  }
});

test("externalIds are unique — a duplicate silently overwrites the earlier card", () => {
  // add-manual-cards upserts BY externalId, so two entries sharing one would
  // leave whichever came last, and the other card would just never exist.
  const seen = new Map<string, number>();
  for (const c of CARDS) {
    const id = c.externalId as string | undefined;
    if (!id) continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(dupes, [], `duplicate externalId(s): ${dupes.join(", ")}`);
});

test("an entry with no externalId is unambiguous on (setCode, collectorNumber, isPromo)", () => {
  // That triple is add-manual-cards' fallback match. Two entries sharing it
  // would fight over one row — the 197b/151b art-fix entries rely on this
  // being unique to find and correct an existing card rather than duplicate it.
  const seen = new Map<string, number>();
  for (const c of CARDS) {
    if (c.externalId) continue;
    const k = `${c.setCode}|${c.collectorNumber}|${c.isPromo === true}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepEqual(dupes, [], `ambiguous id-less entries: ${dupes.join(", ")}`);
});

test("a manual card reusing a base card's collector number MUST be flagged isPromo", () => {
  // This is the whole reason promos are excluded from byKey/bySetlessNum in
  // lib/tcgplayer.ts and from the number paths in price-import.ts. An entry
  // that shares a real number WITHOUT isPromo would collide with the base card
  // in those maps and one of the two would lose its price — the exact shape of
  // the Teemo 263/298 incident (see tests/tcgplayer.test.ts).
  const base = readJson("prisma/riftbound-cards.json") as {
    set_id: string;
    collector_number: number;
    name: string;
  }[];
  const baseNumbers = new Set(base.map((c) => `${c.set_id}|${c.collector_number}`));

  for (const c of CARDS) {
    const num = String(c.collectorNumber);
    const plain = num.match(/^(\d+)\/\d+$/); // exactly "NNN/TTT", no letter suffix
    if (!plain) continue;
    if (!baseNumbers.has(`${c.setCode}|${Number(plain[1])}`)) continue;
    assert.equal(
      c.isPromo,
      true,
      `${c.name} ${c.setCode} ${num} reuses a base card's number and must set isPromo:true`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// The Korean MSI Fan Festa promos (added 2026-09-11). Their stats were READ
// from the base printings rather than typed from memory, and this pins that —
// a promo is the same card, so a cost or might that disagrees with the base
// printing is a transcription error, not a game rule.
// ─────────────────────────────────────────────────────────────────────────────
test("a promo's stats match the base printing it reprints", () => {
  const base = readJson("prisma/riftbound-cards.json") as {
    name: string;
    set_id: string;
    stats?: { energy?: number; might?: number };
  }[];
  const byName = new Map<string, { energy?: number; might?: number }>();
  for (const b of base) if (b.stats && !byName.has(b.name)) byName.set(b.name, b.stats);

  for (const c of CARDS) {
    const stats = byName.get(String(c.name));
    // Only checkable for a card the snapshot actually knows, and only when the
    // manual entry states a value at all (null is "not recorded", not "zero").
    if (!stats) continue;
    if (c.energyCost != null && stats.energy != null) {
      assert.equal(c.energyCost, stats.energy, `${c.name} ${c.collectorNumber}: energy disagrees with the base printing`);
    }
    if (c.might != null && stats.might != null) {
      assert.equal(c.might, stats.might, `${c.name} ${c.collectorNumber}: might disagrees with the base printing`);
    }
  }
});

test("both Korean promos are present, flagged, and numbered as printed", () => {
  const byId = new Map(CARDS.filter((c) => c.externalId).map((c) => [c.externalId as string, c]));
  const jinx = byId.get("promo-ogn-030-jinx-demolitionist-kr-launch");
  const yasuo = byId.get("promo-ogn-076b-yasuo-remorseful-kr-msi");
  assert.ok(jinx, "the Korean launch Jinx must be in manual-cards.json");
  assert.ok(yasuo, "the Korean MSI Yasuo must be in manual-cards.json");

  // Numbers exactly as printed on the cards (OGN 030/298 P KR, OGN 076b/298 P KR).
  assert.equal(jinx!.collectorNumber, "030/298");
  assert.equal(yasuo!.collectorNumber, "076b/298");
  for (const c of [jinx!, yasuo!]) {
    assert.equal(c.isPromo, true, `${c.name} must be flagged isPromo — it shares a numbering space with the base card`);
    // NOT a pack-pulled alt-art: `variant` is the letter a Showcase print
    // carries, and setting it would file these as in-set Showcases, which is
    // exactly the bug scripts/fix-promo-as-variant.ts was written to repair.
    assert.equal(c.variant, undefined, `${c.name} is a promo, not an in-set variant — leave variant unset`);
  }

  // The names must stay EXACT. The card page groups printings with
  // `where: { name: card.name }`, so a "(Korean)" suffix would drop these out
  // of "Other printings" on the base card — the main way anyone finds them.
  assert.equal(jinx!.name, "Jinx, Demolitionist");
  assert.equal(yasuo!.name, "Yasuo, Remorseful");
});
