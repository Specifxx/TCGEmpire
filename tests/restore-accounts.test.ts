import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// The account/marketplace rescue script's table list, checked against the schema
// ─────────────────────────────────────────────────────────────────────────────
// scripts/restore-accounts.ts copies the tables that cannot regenerate
// themselves out of an older database and into the current one. It only works if
// two things are true, and both are the kind of thing that rots silently:
//
//   1. Every foreign-key field it names actually EXISTS on that model. A typo'd
//      field name does not throw — `row[field]` is undefined, the guard reads it
//      as "no parent to check", and the row is inserted unguarded. That is worse
//      than having no guard, because it looks like protection.
//   2. A table is copied only AFTER every table it points at. Get that backwards
//      and the insert fails the foreign key mid-rescue.
//
// So rather than trust the hand-written list, re-derive the truth from
// schema.prisma and compare. A future migration that adds a relation now fails
// here instead of failing in the middle of a recovery.

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const script = readFileSync(join(process.cwd(), "scripts/restore-accounts.ts"), "utf8");

/** model name → [{ field, target }] for every non-list relation. */
function foreignKeys(): Map<string, { field: string; target: string }[]> {
  const out = new Map<string, { field: string; target: string }[]>();
  for (const [, name, body] of schema.matchAll(/^model (\w+) \{(.*?)^\}/gms)) {
    const fks: { field: string; target: string }[] = [];
    for (const m of body.matchAll(/^\s*\w+\s+(\w+)\s*\??\s*@relation\([^)]*fields:\s*\[(\w+)\][^)]*\)/gm)) {
      fks.push({ field: m[2], target: m[1] });
    }
    out.set(name, fks);
  }
  return out;
}

/** The TABLES array as the script declares it, in order. */
function declared(): { label: string; parents: { field: string; of: string }[] }[] {
  const block = script.match(/const TABLES: Table\[\] = \[(.*?)^\];/ms);
  assert.ok(block, "could not find the TABLES array in scripts/restore-accounts.ts");
  const rows: { label: string; parents: { field: string; of: string }[] }[] = [];
  for (const line of block[1].split("\n")) {
    const label = line.match(/label:\s*"(\w+)"/);
    if (!label) continue;
    const parents = Array.from(line.matchAll(/\{\s*field:\s*"(\w+)",\s*of:\s*"(\w+)"\s*\}/g)).map((m) => ({
      field: m[1],
      of: m[2],
    }));
    rows.push({ label: label[1], parents });
  }
  return rows;
}

const FK = foreignKeys();
const TABLES = declared();

test("the rescue script copies something", () => {
  assert.ok(TABLES.length >= 15, `expected the full account/marketplace set, got ${TABLES.length}`);
  assert.equal(TABLES[0].label, "User", "User has no foreign keys and must be copied first");
});

test("every declared table is a real model", () => {
  for (const t of TABLES) assert.ok(FK.has(t.label), `${t.label} is not a model in schema.prisma`);
});

test("every declared foreign key exists on that model, pointing where it claims", () => {
  for (const t of TABLES) {
    const real = FK.get(t.label)!;
    for (const p of t.parents) {
      const hit = real.find((r) => r.field === p.field);
      assert.ok(hit, `${t.label}.${p.field} is not a relation field — the guard would silently no-op`);
      assert.equal(hit.target, p.of, `${t.label}.${p.field} points at ${hit.target}, not ${p.of}`);
    }
  }
});

test("no foreign key on a copied table is left unguarded", () => {
  // Card is the one legitimate exception in the other direction: it is NOT
  // copied (the target's catalogue is newer), but it is a parent, so children
  // must still declare it.
  for (const t of TABLES) {
    for (const r of FK.get(t.label)!) {
      assert.ok(
        t.parents.some((p) => p.field === r.field),
        `${t.label}.${r.field} -> ${r.target} is not declared as a parent; a row pointing at a missing ${r.target} would abort the batch`
      );
    }
  }
});

test("tables are ordered parents-first", () => {
  const seen = new Set<string>(["Card"]); // Card is assumed already present in the target
  for (const t of TABLES) {
    for (const p of t.parents) {
      if (p.of === t.label) continue; // self-reference resolves within the table
      assert.ok(
        seen.has(p.of),
        `${t.label} is copied before ${p.of}, which it points at — reorder TABLES so ${p.of} comes first`
      );
    }
    seen.add(t.label);
  }
});

test("the card catalogue is deliberately NOT copied", () => {
  // RM5's Card/RetailerPrice rows are NEWER than any rescue source's, and they
  // carry the corrected rune prices. Copying them backwards would undo that.
  for (const skip of ["Card", "RetailerPrice", "PriceHistory", "ClickEvent"]) {
    assert.ok(!TABLES.some((t) => t.label === skip), `${skip} must not be in the rescue set`);
  }
});

test("the script refuses to run source-into-itself", () => {
  assert.match(script, /SOURCE_URL === TARGET_URL/, "the same-database guard is gone");
  assert.match(script, /skipDuplicates:\s*true/, "writes must stay additive");
  assert.doesNotMatch(script, /deleteMany|\$executeRaw|TRUNCATE/i, "a rescue script must never delete");
});
