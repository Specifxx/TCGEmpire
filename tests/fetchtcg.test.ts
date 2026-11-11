import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cents, pickCondition } from "../src/lib/fetchtcg";

test("Fetch's price is dollars; we keep cents", () => {
  assert.equal(cents(1.2), 120);
  assert.equal(cents(0.29), 29);
});

test("Near Mint wins, graded and damaged copies never", () => {
  assert.deepEqual(
    pickCondition([{ condition: "Light Play", price: 1 }, { condition: "Near Mint", price: 2 }, { condition: "PSA 10", price: 0.5 }]),
    { condition: "Near Mint", price: 2 },
  );
  assert.equal(pickCondition([{ condition: "PSA 10", price: 10 }, { condition: "Damaged", price: 1 }]), null);
  assert.deepEqual(pickCondition([{ condition: "Moderate Play", price: 3 }, { condition: "Light Play", price: 2 }]), { condition: "Light Play", price: 2 });
});

test("a card matches only on set, collector number and name; a stale or missing file shows nothing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fetchtcg-"));
  mkdirSync(path.join(dir, "data", "fetch-live"), { recursive: true });
  const card = (o: object) => ({ s: "Spiritforged", no: "001:221", n: "Ahri - Nine-Tailed (Alternate Art)", f: "Normal", c: "Near Mint", p: 250, u: "https://www.fetchtcg.com/cards/x?utm_source=a", ...o });
  writeFileSync(
    path.join(dir, "data", "fetch-live", "au.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), cards: [card({}), card({ f: "Foil", p: 900 }), card({ no: "002:221", n: "Someone else" })] }),
  );
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const { fetchRowsFor } = await import("../src/lib/fetchtcg");
    const r = fetchRowsFor({ name: "Ahri, Nine-Tailed", setName: "Spirit Forged", collectorNumber: "001/221" });
    assert.deepEqual(r?.rows.map((x) => [x.finish, x.priceCents]), [["Normal", 250], ["Foil", 900]]);
    assert.equal(fetchRowsFor({ name: "Ahri, Nine-Tailed", setName: "Spirit Forged", collectorNumber: "001/221", isPromo: true }), null);
    assert.equal(fetchRowsFor({ name: "Another Name", setName: "Spirit Forged", collectorNumber: "001/221" }), null);
    assert.equal(fetchRowsFor({ name: "Ahri, Nine-Tailed", setName: "Spirit Forged", collectorNumber: "001a/221" }), null);
  } finally {
    process.chdir(cwd);
  }
});

test("the feed is never committed and never read by a page except the card page", () => {
  assert.match(readFileSync(".gitignore", "utf8"), /^\/data\/fetch-live\/$/m);
  assert.match(readFileSync("package.json", "utf8"), /fetch-fetchtcg\.ts/);
});
