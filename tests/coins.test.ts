import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARCADE_GAMES,
  BADGES,
  BADGE_CHANCE,
  BADGE_PITY,
  CLIENT_CLAIMABLE,
  COINS,
  EPIC_PITY,
  LEGENDARY_PITY,
  PREMIUM_BOOST,
  PREMIUM_REDEEM_COST,
  RARITY_ODDS,
  SPIN_COST,
  STREAK_DAYS,
  TASKS,
  nextStreak,
  previousDay,
  redeemBlocker,
  redeemKey,
  roll,
  rollBadge,
  streakBonusDue,
  taskById,
  taskReward,
  type Pity,
} from "../src/lib/coins";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

// ─────────────────────────────────────────────────────────────────────────────
// RIFTCOMPARE COINS (2026-10-16, owner): twelve champion coins, gacha-style.
// RIFTCOINS (2026-10-17, owner): every signed-in member earns Riftcoins (Premium
// double) and spends them on Rift Slots (a coin, and a chance at a profile
// badge) or a free week of Premium. DECISIONS.md, "RiftCompare Coins", "Riftcoins".
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
  assert.deepEqual([...CLIENT_CLAIMABLE].sort(), ["arcade", "daily", "share", "visit", "welcome"]);
  for (const t of TASKS) assert.ok(t.once || t.perDay != null || t.id === "referral", `${t.id} is capped`);
  assert.match(read("src/app/api/alerts/watchlist/route.ts"), /const coins = await rewardWatch\(user, card\.id\);/);
  assert.match(read("src/lib/referral.ts"), /await rewardReferral\(referrer\.id, newUserId\);/);
  assert.match(read("src/components/ShareButton.tsx"), /earnCoin\("share"\)/);
  assert.match(read("src/components/OutboundLink.tsx"), /earnCoin\("visit"\)/);
  assert.match(read("src/lib/coins-client.ts"), /if \(!me\.user\) return;/, "nobody signed out sends a claim");
});

test("every arcade game pays once a day, from its own game-over moment", () => {
  assert.equal(taskById("arcade")!.perDay, ARCADE_GAMES.length);
  const where: Record<string, string> = {
    "higher-lower": "src/components/games/HigherLower.tsx",
    "pack-sim": "src/components/games/PackSim.tsx",
    "seraphines-piano": "src/components/games/SeraphinesPiano.tsx",
    riftle: "src/components/Riftle.tsx",
  };
  assert.deepEqual(Object.keys(where).sort(), [...ARCADE_GAMES].sort());
  for (const [game, file] of Object.entries(where)) assert.match(read(file), new RegExp(`earnArcade\\("${game}"\\)`), file);
  // Keyed by the game, so replaying the same game pays nothing more today.
  assert.match(read("src/lib/coins-server.ts"), /payCapped\(userId, "arcade", premium, now, \(\) => `\$\{today\}:\$\{game\}`\)/);
});

test("Premium earns double on every task, and nothing else changes with the tier", () => {
  assert.equal(PREMIUM_BOOST, 2);
  for (const t of TASKS) {
    assert.equal(taskReward(t.id, false), t.riftcoins);
    assert.equal(taskReward(t.id, true), t.riftcoins * PREMIUM_BOOST);
  }
});

test("the economy: a week of Premium is about a month of steady use, a spin about a day", () => {
  const r = (id: string) => taskById(id)!.riftcoins;
  // Steady: check in daily (with the streak), finish two games, two other tasks.
  const steady = r("daily") + r("streak") / STREAK_DAYS + 2 * r("arcade") + 2 * r("watch");
  const days = PREMIUM_REDEEM_COST / steady;
  assert.ok(days >= 25 && days <= 40, `steady use reaches free Premium in ${days.toFixed(1)} days`);
  // Every cap hit, every day: still well over two weeks.
  const max = r("daily") + r("streak") / STREAK_DAYS + TASKS.filter((t) => t.perDay && t.id !== "daily" && t.id !== "streak").reduce((a, t) => a + t.riftcoins * t.perDay!, 0);
  assert.ok(max < 80, `max ${max}/day`);
  assert.ok(PREMIUM_REDEEM_COST / max >= 14, "no one grinds a free week in under two weeks");
  assert.ok(SPIN_COST / steady >= 1 && SPIN_COST / steady <= 2, "about one spin a day");
});

test("badges: a spin wins one at BADGE_CHANCE, never more than BADGE_PITY spins apart, a new one before a repeat", () => {
  assert.equal(BADGES.length, 6);
  assert.equal(rollBadge(BADGE_CHANCE, 0, 0, []).badge, null);
  assert.ok(rollBadge(BADGE_CHANCE - 0.001, 0, 0, []).badge);
  const forced = rollBadge(0.99, 0, BADGE_PITY - 1, []);
  assert.ok(forced.badge && forced.forced);
  assert.equal(forced.sinceBadge, 0);
  // Five owned: the win is always the sixth.
  const owned = BADGES.slice(0, 5).map((b) => b.id);
  for (const r2 of [0, 0.5, 0.999]) assert.equal(rollBadge(0, r2, 0, owned).badge!.id, BADGES[5].id);
  // The unluckiest player still completes the set.
  let since = 0;
  const have: string[] = [];
  for (let i = 0; i < BADGES.length * BADGE_PITY; i++) {
    const b = rollBadge(0.99, 0.3, since, have);
    since = b.sinceBadge;
    if (b.badge && !have.includes(b.badge.id)) have.push(b.badge.id);
  }
  assert.equal(have.length, BADGES.length);
});

test("free Premium: once a month, enough Riftcoins, and never on top of a paid plan", () => {
  assert.equal(redeemKey(new Date("2026-10-17T09:00:00Z")), "2026-10");
  assert.equal(redeemBlocker({ riftcoins: PREMIUM_REDEEM_COST, redeemedThisMonth: false }, { hasPaidPlan: false }), null);
  assert.equal(redeemBlocker({ riftcoins: PREMIUM_REDEEM_COST - 1, redeemedThisMonth: false }, { hasPaidPlan: false }), "short");
  assert.equal(redeemBlocker({ riftcoins: 99999, redeemedThisMonth: true }, { hasPaidPlan: false }), "this-month");
  assert.equal(redeemBlocker({ riftcoins: 99999, redeemedThisMonth: false }, { hasPaidPlan: true }), "paid-plan");
  const server = read("src/lib/coins-server.ts");
  const redeem = server.slice(server.indexOf("export async function redeemPremium"), server.indexOf("// ── The page's view"));
  assert.match(redeem, /if \(hasPaidPlan\(user\)\) return \{ ok: false, reason: "paid-plan" \};/);
  assert.match(redeem, /prisma\.\$transaction\(\[\s*prisma\.coinTask\.create\(\{ data: \{ userId: user\.id, task: "redeem", key,/, "the month's row and the debit move together");
  assert.match(redeem, /where: \{ userId: user\.id, riftcoins: \{ gte: PREMIUM_REDEEM_COST \} \}/, "a short balance spends nothing");
  assert.match(redeem, /grantPremiumDays\(user\.id, PREMIUM_REDEEM_DAYS, "premium"\)/);
  assert.match(redeem, /refunding/, "a failed grant puts the Riftcoins back");
});

test("chance only ever wins collectibles: a spin never pays Riftcoins or Premium", () => {
  const server = read("src/lib/coins-server.ts");
  const spinFn = server.slice(server.indexOf("export async function spin("), server.indexOf("/** Show a badge"));
  assert.doesNotMatch(spinFn, /riftcoins: \{ increment/, "a spin never adds Riftcoins");
  assert.doesNotMatch(spinFn, /grantPremium/, "a spin never grants Premium");
  assert.match(spinFn, /riftcoins: \{ decrement: SPIN_COST \}/);
  assert.match(spinFn, /where: \{ userId, pullsMade: w\.pullsMade, \.\.\.spend\.where \}/, "a spin is conditional on the wallet it read");
});

test("every reward is idempotent and every write needs a signed-in member", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model CoinTask \{[\s\S]*?@@unique\(\[userId, task, key\]\)/);
  assert.match(schema, /model BadgeOwned \{[\s\S]*?@@id\(\[userId, badgeId\]\)/);
  const server = read("src/lib/coins-server.ts");
  assert.match(server, /prisma\.\$transaction\(\[\s*prisma\.coinTask\.create/, "the task row and the wallet move together");
  assert.match(server, /randomInt\(/, "the rolls use crypto randomness, on the server");
  for (const f of ["claim", "pull", "redeem", "badge"]) {
    const src = read(`src/app/api/coins/${f}/route.ts`);
    assert.match(src, /if \(!user \|\| !coinsEnabledFor\(user\)\) return NextResponse\.json\(/, f);
    assert.match(src, /rateLimit\(`coins:/, f);
  }
});

test("coins are private and never for sale", () => {
  for (const m of ["CoinWallet", "CoinTask", "CoinOwned", "BadgeOwned"]) {
    assert.ok(!(PUBLIC_MODELS as readonly string[]).includes(m), `${m} must never be exported publicly`);
  }
  const files = [
    "src/lib/coins.ts",
    "src/lib/coins-server.ts",
    "src/components/coins/CoinCollection.tsx",
    "src/app/api/coins/pull/route.ts",
    "src/app/api/coins/redeem/route.ts",
    "src/app/api/coins/badge/route.ts",
  ];
  for (const f of files) assert.doesNotMatch(read(f), /stripe|checkout|priceId/i, `${f}: no payment anywhere near a pull`);
  const page = read("src/components/coins/CoinCollection.tsx");
  assert.match(page, /can&apos;t be bought or sold and have no cash value/);
  assert.match(page, /Riftcoins are earned by using the site, never won on a spin/);
});

test("/coins is a static shell cached a day, kept out of the index, in the nav and the Premium table", () => {
  const page = read("src/app/coins/page.tsx");
  assert.match(page, /export const revalidate = 86400;/);
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.doesNotMatch(page, /prisma/, "no database read at render");
  assert.match(read("src/components/nav-groups.ts"), /href: "\/coins", label: "Riftcoins & Rift Slots"/);
  assert.match(read("src/components/TierComparisonTable.tsx"), /account: "Earn 1×", plus: "Earn 1×", premium: "Earn 2×"/);
});
