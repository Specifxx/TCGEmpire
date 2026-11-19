// The card scanner's matcher and caps (lib/scan/, DECISIONS.md 2026-11-19 "Card scanner beta"), against the real
// public catalogue in data/public/cards.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchScan, parseNumber, normName, visualTwins, type ScanCatalogCard, type ScanReading } from "../src/lib/scan/match";
import { scanAccess, scanConfig } from "../src/lib/scan/caps";

const ROOT = process.cwd();
const catalog: ScanCatalogCard[] = JSON.parse(readFileSync(join(ROOT, "data/public/cards.json"), "utf8"));
const R = (r: Partial<ScanReading>): ScanReading => ({ isTradingCard: true, game: "riftbound", name: null, setCode: null, collectorNumber: null, promoStamp: false, ...r });
const ext = (id: string | null) => catalog.find((c) => c.id === id) as unknown as { externalId: string; name: string; collectorNumber: string; isPromo: boolean } | undefined;

test("parseNumber reads printed numbers the way the catalogue writes them", () => {
  assert.deepEqual(parseNumber("66/298"), { base: "066", suffix: "", total: "298" });
  assert.deepEqual(parseNumber("OGN · 104A/221"), { base: "104", suffix: "a", total: "221" });
  assert.deepEqual(parseNumber("299*/298"), { base: "299", suffix: "*", total: "298" });
  assert.deepEqual(parseNumber("O66/298"), { base: "066", suffix: "", total: "298" });
  assert.equal(parseNumber("no number"), null);
  assert.equal(normName("Annie, Dark Child - Starter"), "anniedarkchild");
});

test("name + set + number: the booster printing, high confidence, the promo twin offered", () => {
  const m = matchScan(R({ name: "Blazing Scorcher", setCode: "OGN", collectorNumber: "001/298" }), catalog);
  assert.equal(ext(m.bestId)?.externalId, "ogn-001-298");
  assert.equal(m.confidence, "high");
  assert.ok(m.alternateIds.some((id) => ext(id)?.externalId === "ogn-001-p"));
});

test("a promo stamp picks the promo printing", () => {
  const m = matchScan(R({ name: "Blazing Scorcher", setCode: "OGN", collectorNumber: "001/298", promoStamp: true }), catalog);
  assert.equal(ext(m.bestId)?.externalId, "ogn-001-p");
});

test("the letter suffix separates an alt art from its base card", () => {
  const alt = catalog.find((c) => c.setCode === "OGN" && c.collectorNumber === "007a/298")!;
  const m = matchScan(R({ name: alt.name, setCode: "OGN", collectorNumber: "007a/298" }), catalog);
  assert.equal(m.bestId, alt.id);
  const base = matchScan(R({ name: alt.name, setCode: "OGN", collectorNumber: "007/298" }), catalog);
  assert.equal(ext(base.bestId)?.collectorNumber, "007/298");
});

test("an overnumbered star is read as its own printing", () => {
  const star = catalog.find((c) => c.collectorNumber === "299*/298")!;
  const m = matchScan(R({ name: star.name, setCode: star.setCode, collectorNumber: "299*/298" }), catalog);
  assert.equal(m.bestId, star.id);
});

test("an OCR slip in the name still matches when the number agrees", () => {
  const m = matchScan(R({ name: "Blazing Scorchr", setCode: "OGN", collectorNumber: "001/298" }), catalog);
  assert.equal(ext(m.bestId)?.externalId, "ogn-001-298");
});

test("a champion read without its title finds the printing by number", () => {
  const jinx = catalog.find((c) => c.name === "Jinx, Loose Cannon" && !c.isPromo)!;
  const m = matchScan(R({ name: "Jinx", setCode: jinx.setCode, collectorNumber: jinx.collectorNumber }), catalog);
  assert.equal(m.bestId, jinx.id);
});

test("name and number disagree: low confidence, never high", () => {
  const m = matchScan(R({ name: "Blazing Scorcher", setCode: "OGN", collectorNumber: "150/298" }), catalog);
  assert.equal(m.confidence, "low");
  assert.equal(ext(m.bestId)?.name, "Blazing Scorcher");
});

test("no number legible: matched by name, never high when there are several printings", () => {
  const m = matchScan(R({ name: "Blazing Scorcher" }), catalog);
  assert.equal(ext(m.bestId)?.externalId, "ogn-001-298");
  assert.notEqual(m.confidence, "high");
});

test("another game, a non-card or an unknown name match nothing", () => {
  assert.equal(matchScan(R({ game: "pokemon", name: "Pikachu" }), catalog).bestId, null);
  assert.equal(matchScan(R({ isTradingCard: false }), catalog).bestId, null);
  assert.equal(matchScan(R({ name: "Completely Unknown Card Name" }), catalog).bestId, null);
});

test("access: off without a key; open to everyone signed in (5 free, 100 Premium) unless SCAN_PUBLIC=0", () => {
  const off = scanConfig({});
  assert.equal(scanAccess(off, { isAdmin: true, premium: true }).ok, false);
  const pub = scanConfig({ ANTHROPIC_API_KEY: "x" });
  assert.deepEqual(scanAccess(pub, { isAdmin: true, premium: true }), { ok: true, perUserLimit: null });
  assert.deepEqual(scanAccess(pub, { isAdmin: false, premium: false }), { ok: true, perUserLimit: 5 });
  assert.deepEqual(scanAccess(pub, { isAdmin: false, premium: true }), { ok: true, perUserLimit: 100 });
  assert.deepEqual(scanAccess(pub, null), { ok: false, status: 401, error: "Sign in to scan cards: it's free." });
  assert.equal(pub.dailyCap, 1000);
  const closed = scanConfig({ ANTHROPIC_API_KEY: "x", SCAN_PUBLIC: "0" });
  assert.deepEqual(scanAccess(closed, { isAdmin: true, premium: false }), { ok: true, perUserLimit: null });
  assert.equal(scanAccess(closed, { isAdmin: false, premium: true }).ok, false);
});

test("a scan never reaches eBay and the page stays a static, unindexed shell", () => {
  const files = ["src/lib/scan/read.ts", "src/lib/scan/match.ts", "src/lib/scan/caps.ts", "src/lib/scan/catalog.ts", "src/app/api/scan/identify/route.ts", "src/components/scan/CardScanner.tsx", "src/components/scan/Viewfinder.tsx", "src/lib/scan/frame.ts"];
  for (const f of files) assert.doesNotMatch(readFileSync(join(ROOT, f), "utf8"), /ebay[-_/]?(api|browse)|lib\/ebay/i, f);
  const page = readFileSync(join(ROOT, "src/app/scan/page.tsx"), "utf8");
  assert.match(page, /index: false/);
  assert.doesNotMatch(page, /getCurrentUser|cookies\(|headers\(|@\/lib\/db/);
});

test("look-alike printings: a promo with its own photo and an alt art are offered to the picture check; a lone card is not", () => {
  const base = catalog.find((c) => (c as unknown as { externalId: string }).externalId === "ogn-007-298")!;
  const twins = visualTwins(base.id, catalog);
  assert.equal(twins[0].id, base.id);
  assert.ok(twins.length >= 2 && twins.length <= 4);
  assert.equal(new Set(twins.map((c) => c.imageUrl)).size, twins.length, "one card per distinct picture");
  const lone = catalog.find((c) => catalog.filter((x) => x.setCode === c.setCode && parseNumber(x.collectorNumber)?.base === parseNumber(c.collectorNumber)?.base).length === 1)!;
  assert.deepEqual(visualTwins(lone.id, catalog), []);
});

test("a letter or star the model read narrows the look-alikes; booster-vs-promo twins are flagged for the visitor", async () => {
  const { onlyPromoTwins } = await import("../src/lib/scan/match");
  const star = catalog.find((c) => c.collectorNumber === "303*/298")!;
  assert.ok(visualTwins(star.id, catalog, 4, "303*/298").every((c) => c.collectorNumber === "303*/298"));
  const b = catalog.find((c) => (c as unknown as { externalId: string }).externalId === "ogn-055-298")!;
  const tw = visualTwins(b.id, catalog, 4, "055/298");
  assert.ok(tw.length >= 2);
  assert.equal(onlyPromoTwins(tw), true);
  const alt = catalog.find((c) => (c as unknown as { externalId: string }).externalId === "ogn-007-298")!;
  assert.equal(onlyPromoTwins(visualTwins(alt.id, catalog, 4, "007/298")), false);
});
