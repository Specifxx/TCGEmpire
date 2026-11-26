import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_HITS_PER_PACK,
  MAX_PACKS_PER_LOG,
  MIN_MEMBERS,
  MIN_PACKS,
  PULL_RATE_SETS,
  onePerText,
  parsePullLog,
  pullTier,
  setIsOpen,
  shapeTally,
  toPublish,
} from "../src/lib/pull-rates";

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY PULL RATES (2026-11-26; DECISIONS.md "Community pull rates"): members log packs and every
// Epic and Showcase in them; pages show only per-set totals, once enough members and packs are in.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
type Row = { id: string; setCode: string; rarity: string; collectorNumber: string; isPromo: boolean; name: string };
const catalog = JSON.parse(read("data/public/cards.json")) as Row[];
const card = (setCode: string, num: string) => {
  const c = catalog.find((x) => x.setCode === setCode && x.collectorNumber === num && !x.isPromo);
  assert.ok(c, `${setCode} ${num} is in the catalogue`);
  return c!;
};

test("each printing counts in its own tier, the rarest winning, and Rares are not logged", () => {
  assert.equal(pullTier(card("OGN", "027a/298")), "altart");
  assert.equal(pullTier(card("OGN", "299/298")), "overnumbered");
  assert.equal(pullTier(card("OGN", "299*/298")), "signature");
  assert.equal(pullTier(card("OGN", "303a/298")), "overnumbered", "an alt-art overnumber is an overnumber");
  assert.equal(pullTier(card("RAD", "174a*/167")), "signature");
  assert.equal(pullTier(card("RAD", "184/167")), "ultimate", "Packed Amphitheater");
  assert.equal(pullTier(card("UNL", "238/219")), "ultimate", "Baron Nashor");
  assert.equal(pullTier(card("VEN", "019A/166")), "altart", "Vendetta prints the suffix in capitals");
  assert.equal(pullTier(card("RAD", "R01A")), "showcase", "an alt-art rune has no published rate");
  const epic = catalog.find((c) => c.setCode === "RAD" && c.rarity === "Epic" && !c.isPromo)!;
  assert.equal(pullTier(epic), "epic");
  const rare = catalog.find((c) => c.setCode === "RAD" && c.rarity === "Rare" && !c.isPromo)!;
  assert.equal(pullTier(rare), null);
});

const rad = catalog.filter((c) => c.setCode === "RAD" && !c.isPromo);
const epics = rad.filter((c) => c.rarity === "Epic");

test("a log is checked against the set's own cards and refused, never trimmed, when it is impossible", () => {
  const ok = parsePullLog({ set: "radiance", packs: 24, hits: [{ cardId: epics[0].id, qty: 2 }, { cardId: epics[0].id }, { cardId: epics[1].id }], source: "scan" }, rad);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.log.setCode, "RAD");
    assert.deepEqual(ok.log.hits.find((h) => h.cardId === epics[0].id), { cardId: epics[0].id, tier: "epic", qty: 3 }, "duplicates merge");
    assert.equal(ok.log.source, "scan");
  }
  const none = parsePullLog({ set: "RAD", packs: 1, hits: [] }, rad);
  assert.ok(none.ok, "a pack with no hit is data too");
  const rare = rad.find((c) => c.rarity === "Rare")!;
  const withRare = parsePullLog({ set: "radiance", packs: 1, hits: [{ cardId: rare.id, qty: 2 }] }, rad);
  assert.ok(withRare.ok && withRare.log.hits.length === 0, "Rares from the tracker are dropped, not refused");

  const other = catalog.find((c) => c.setCode === "OGN" && c.rarity === "Epic")!;
  assert.equal(parsePullLog({ set: "radiance", packs: 1, hits: [{ cardId: other.id }] }, [...rad, other]).ok, false, "another set's card");
  assert.equal(parsePullLog({ set: "radiance", packs: MAX_PACKS_PER_LOG + 1, hits: [] }, rad).ok, false);
  assert.equal(parsePullLog({ set: "radiance", packs: 0, hits: [] }, rad).ok, false);
  assert.equal(parsePullLog({ set: "radiance", packs: 1.5, hits: [] }, rad).ok, false);
  assert.equal(parsePullLog({ set: "radiance", packs: 1, hits: [{ cardId: epics[0].id, qty: MAX_HITS_PER_PACK + 1 }] }, rad).ok, false, "more hits than a pack holds");
  assert.equal(parsePullLog({ set: "proving-grounds", packs: 1, hits: [] }, rad).ok, false, "not a pack set");
});

test("Legacy logging opens on its first Pre-Rift day, not before", () => {
  const legacy = PULL_RATE_SETS.find((s) => s.code === "LGC")!;
  assert.equal(legacy.opensOn, "2027-01-22");
  assert.equal(setIsOpen(legacy, new Date("2026-12-13T00:00:00Z")), false);
  assert.equal(setIsOpen(legacy, new Date("2027-01-22T00:00:00Z")), true);
  assert.equal(parsePullLog({ set: "legacy", packs: 1, hits: [] }, [], new Date("2026-12-20T00:00:00Z")).ok, false);
});

test("nothing but progress is published until enough members and packs are in", () => {
  const at = new Date("2026-12-01T00:00:00Z");
  const thin = shapeTally([{ setCode: "RAD", packs: 30, logs: 2 }], [{ setCode: "RAD", members: MIN_MEMBERS - 1 }], [{ setCode: "RAD", cardId: "a", tier: "epic", qty: 7 }], at);
  assert.equal(thin.sets.RAD.published, false);
  assert.equal(thin.sets.RAD.tiers.epic, 0, "no tier counts leave the server before publishing");
  assert.deepEqual(thin.sets.RAD.cards, []);
  assert.deepEqual(toPublish(thin.sets.RAD), { packs: 0, members: 1 });

  const full = shapeTally(
    [{ setCode: "RAD", packs: MIN_PACKS * 4, logs: 5 }],
    [{ setCode: "RAD", members: MIN_MEMBERS }],
    [
      { setCode: "RAD", cardId: "a", tier: "epic", qty: 20 },
      { setCode: "RAD", cardId: "b", tier: "epic", qty: 4 },
      { setCode: "RAD", cardId: "c", tier: "altart", qty: 8 },
      { setCode: "RAD", cardId: "x", tier: "rare", qty: 99 },
    ],
    at,
  );
  const s = full.sets.RAD;
  assert.equal(s.published, true);
  assert.equal(s.tiers.epic, 24);
  assert.equal(s.tiers.altart, 8);
  assert.deepEqual(s.cards.map((c) => c.cardId), ["a", "c", "b"], "most pulled first; an unknown tier is ignored");
  assert.equal(onePerText(96 / 24), "1 in 4 packs");
  assert.equal(onePerText(96 / 8), "1 in 12 packs");
  assert.equal(onePerText(null), "none yet");
});

test("logs are members-only, private, bounded, and the owner hears about milestones, not every log", () => {
  const route = code("src/app/api/pulls/route.ts");
  assert.match(route, /getCurrentUser\(\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /MAX_LOGS_PER_DAY/);
  assert.match(route, /MAX_PACKS_PER_MEMBER_SET/);
  assert.match(route, /deleteMany\(\{ where: \{ id, userId: user\.id \} \}\)/, "a member deletes only their own log");
  assert.match(route, /import \{ notifyOwnerBounded \} from "@\/lib\/ops\/notify-owner";/);
  assert.ok(route.indexOf("notifyOwnerBounded({") > route.indexOf("prisma.pullLog.create("), "notify after the row is saved");
  assert.match(route, /total\.value === 1 \|\| total\.value % 50 === 0/);
  assert.doesNotMatch(route, /ebay/i);

  // Pages read only the grouped tally: never a log row, a member or the session.
  for (const p of ["src/app/pull-rates/page.tsx", "src/app/pull-rates/[set]/page.tsx", "src/app/api/pulls/rates/route.ts"]) {
    const src = code(p);
    assert.doesNotMatch(src, /prisma\.|@\/lib\/db"|getCurrentUser|cookies\(|headers\(/, p);
  }
  const server = code("src/lib/pull-rates-server.ts");
  assert.match(server, /groupBy/);
  assert.doesNotMatch(server, /findMany|unstable_cache/);
  for (const p of ["src/app/pull-rates/page.tsx", "src/app/pull-rates/[set]/page.tsx"]) assert.match(read(p), /export const revalidate = 21600;/);
  assert.match(read("src/app/api/pulls/rates/route.ts"), /s-maxage=21600/);
});

test("an unpublished set page stays out of the index; the hub is in the sitemap and the ops monitor watches the tally", () => {
  assert.match(read("src/app/pull-rates/[set]/page.tsx"), /tally\?\.published \? \{\} : \{ robots: \{ index: false, follow: true \} \}/);
  assert.match(read("src/lib/sitemap-sections.ts"), /\/pull-rates`/);
  assert.match(read("src/lib/ops/checks.ts"), /add\("site:pull-rates"/);
  // No pop-up: the contribute block is part of the tracker's panel (UX guard, one prompt a visit).
  const tracker = read("src/components/PullTracker.tsx");
  assert.match(tracker, /fetch\("\/api\/pulls"/);
  assert.doesNotMatch(tracker, /Modal|<dialog|showModal/);
});
