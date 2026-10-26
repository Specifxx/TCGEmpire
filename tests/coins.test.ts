import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLIENT_CLAIMABLE,
  COINS,
  EPIC_PITY,
  LEGENDARY_PITY,
  RARITY_ODDS,
  TASKS,
  nextStreak,
  previousDay,
  roll,
  streakBonusDue,
  type Pity,
} from "../src/lib/coins";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

// ─────────────────────────────────────────────────────────────────────────────
// RIFTCOMPARE COINS (2026-10-16, owner): Premium members earn pulls from tasks
// and collect twelve champion coins, gacha-style. DECISIONS.md, "RiftCompare Coins".
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("twelve coins, each with its art, in four rarities whose odds add up", () => {
  assert.equal(COINS.length, 12);
  assert.equal(new Set(COINS.map((c) => c.id)).size, 12);
  for (const c of COINS) assert.ok(existsSync(join(process.cwd(), "public/coins", `${c.id}.webp`)), `${c.id} has art`);
  const by = (r: string) => COINS.filter((c) => c.rarity === r).length;
  assert.deepEqual([by("common"), by("rare"), by("epic"), by("legendary")], [5, 4, 2, 1]);
  const sum = Object.values(RARITY_ODDS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("a roll lands where its odds say", () => {
  const fresh: Pity = { sinceEpic: 0, sinceLegendary: 0 };
  assert.equal(roll(0.0, 0, fresh).coin.rarity, "legendary");
  assert.equal(roll(0.019, 0, fresh).coin.rarity, "legendary");
  assert.equal(roll(0.05, 0, fresh).coin.rarity, "epic");
  assert.equal(roll(0.2, 0, fresh).coin.rarity, "rare");
  assert.equal(roll(0.9, 0, fresh).coin.rarity, "common");
  assert.equal(roll(0.9, 0.9999, fresh).coin.id, COINS.filter((c) => c.rarity === "common").at(-1)!.id, "r2 picks within the rarity");
});

test("pity: never more than EPIC_PITY pulls without an Epic, or LEGENDARY_PITY without the Legendary", () => {
  let pity: Pity = { sinceEpic: 0, sinceLegendary: 0 };
  // The unluckiest possible player: every roll is a Common.
  let sinceEpic = 0;
  let sinceLegendary = 0;
  for (let i = 0; i < 500; i++) {
    const r = roll(0.99, 0.5, pity);
    pity = r.pity;
    sinceEpic = r.coin.rarity === "epic" || r.coin.rarity === "legendary" ? 0 : sinceEpic + 1;
    sinceLegendary = r.coin.rarity === "legendary" ? 0 : sinceLegendary + 1;
    assert.ok(sinceEpic < EPIC_PITY, `pull ${i}: ${sinceEpic} without an Epic`);
    assert.ok(sinceLegendary < LEGENDARY_PITY, `pull ${i}: ${sinceLegendary} without the Legendary`);
  }
  const forced = roll(0.99, 0, { sinceEpic: EPIC_PITY - 1, sinceLegendary: 3 });
  assert.equal(forced.forced, true);
  assert.equal(forced.coin.rarity, "epic");
  assert.deepEqual(forced.pity, { sinceEpic: 0, sinceLegendary: 4 });
});

test("over many fair pulls the rarities come out near their odds", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let pity: Pity = { sinceEpic: 0, sinceLegendary: 0 };
  const n = 20000;
  const seen: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < n; i++) {
    const r = roll(rnd(), rnd(), pity);
    pity = r.pity;
    seen[r.coin.rarity]++;
  }
  // Pity lifts the top two a little above their base odds; never below.
  assert.ok(seen.legendary / n >= 0.02 && seen.legendary / n < 0.05, `legendary ${seen.legendary / n}`);
  assert.ok(seen.epic / n >= 0.09 && seen.epic / n < 0.16, `epic ${seen.epic / n}`);
  assert.ok(seen.common / n > 0.5, `common ${seen.common / n}`);
});

test("streaks: consecutive days count up, a gap starts again, every 7th day pays the bonus", () => {
  assert.equal(previousDay("2026-11-01"), "2026-10-31");
  assert.equal(nextStreak(null, 0, "2026-10-16"), 1);
  assert.equal(nextStreak("2026-10-15", 6, "2026-10-16"), 7);
  assert.equal(nextStreak("2026-10-14", 6, "2026-10-16"), 1);
  assert.equal(nextStreak("2026-10-16", 3, "2026-10-16"), 3, "a second check-in the same day changes nothing");
  assert.equal(streakBonusDue(7), true);
  assert.equal(streakBonusDue(14), true);
  assert.equal(streakBonusDue(8), false);
});

test("the browser can only claim the tasks it alone can see; watching and referrals are recorded where they happen", () => {
  assert.deepEqual([...CLIENT_CLAIMABLE].sort(), ["daily", "share", "visit", "welcome"]);
  for (const t of TASKS) assert.ok(t.once || t.perDay != null || t.id === "referral", `${t.id} is capped`);
  assert.match(read("src/app/api/alerts/watchlist/route.ts"), /const coins = await rewardWatch\(user, card\.id\);/);
  assert.match(read("src/lib/referral.ts"), /await rewardReferral\(referrer\.id, newUserId\);/);
  assert.match(read("src/components/ShareButton.tsx"), /earnCoin\("share"\)/);
  assert.match(read("src/components/OutboundLink.tsx"), /earnCoin\("visit"\)/);
  assert.match(read("src/lib/coins-client.ts"), /if \(me\.tier !== "premium"\) return;/, "nobody but a Pro member sends a claim");
});

test("every reward is idempotent and every write is gated on Pro", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model CoinTask \{[\s\S]*?@@unique\(\[userId, task, key\]\)/);
  const server = read("src/lib/coins-server.ts");
  assert.match(server, /export const COIN_TIER = "premium" as const;/);
  assert.match(server, /prisma\.\$transaction\(\[\s*prisma\.coinTask\.create/, "the task row and the wallet move together");
  assert.match(server, /where: \{ userId, pullsMade: w\.pullsMade,/, "a pull is conditional on the wallet it read");
  assert.match(server, /randomInt\(/, "the roll uses crypto randomness, on the server");
  for (const f of ["src/app/api/coins/claim/route.ts", "src/app/api/coins/pull/route.ts"]) {
    const src = read(f);
    assert.match(src, /if \(!coinsEnabledFor\(user\)\) return NextResponse\.json\(\{ error: "Coins are a Pro perk" \}, \{ status: 403 \}\);/, f);
    assert.match(src, /rateLimit\(`coins:/, f);
  }
});

test("coins are private and never for sale", () => {
  for (const m of ["CoinWallet", "CoinTask", "CoinOwned"]) {
    assert.ok(!(PUBLIC_MODELS as readonly string[]).includes(m), `${m} must never be exported publicly`);
  }
  const files = ["src/lib/coins.ts", "src/lib/coins-server.ts", "src/components/coins/CoinCollection.tsx", "src/app/api/coins/pull/route.ts"];
  for (const f of files) assert.doesNotMatch(read(f), /stripe|checkout|priceId/i, `${f}: no payment anywhere near a pull`);
  assert.match(read("src/components/coins/CoinCollection.tsx"), /can&apos;t be bought or sold and have no cash value/);
});

test("/coins is a static shell cached a day, kept out of the index, in the nav and the Pro table", () => {
  const page = read("src/app/coins/page.tsx");
  assert.match(page, /export const revalidate = 86400;/);
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.doesNotMatch(page, /prisma/, "no database read at render");
  assert.match(read("src/components/nav-groups.ts"), /href: "\/coins", label: "RiftCompare Coins"/);
  assert.match(read("src/components/TierComparisonTable.tsx"), /feature: "RiftCompare Coins — earn free pulls and collect twelve champion coins", account: false, plus: false, premium: true/);
});
