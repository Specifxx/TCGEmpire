import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_HISTORY_DAYS, historyCsv, olderFrom, recentWindow } from "../src/lib/history-access";
import { compareGrades, gradeLabel, gradedSnapshot } from "../src/lib/graded-history";
import { cheapestByGrade, shouldEmailGraded } from "../src/lib/graded-watch";
import { auctionMatchesCard, identityOf, runAuctionAlerts } from "../src/lib/auction-alerts";

// ─────────────────────────────────────────────────────────────────────────────
// The paid features added with the search meter (2026-10-09, owner): full price
// history and CSV for Plus, graded price tracking for Plus, auction alerts for
// Premium. DECISIONS.md, "Full price history, graded tracking and auction alerts".
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DAY = 86_400_000;
const NOW = new Date("2026-10-09T12:00:00Z");

// ── Full price history ──────────────────────────────────────────────────────

test("free sees the last 30 days and is told where the older part starts", () => {
  const now = NOW.getTime();
  const pts = [90, 45, 31, 29, 10, 1].map((d) => ({ t: now - d * DAY, v: 100 + d }));
  assert.equal(FREE_HISTORY_DAYS, 30);
  assert.deepEqual(recentWindow(pts, now).map((p) => p.v), [129, 110, 101]);
  assert.equal(olderFrom(pts, now), now - 90 * DAY);
  assert.equal(olderFrom(recentWindow(pts, now), now), null, "nothing hidden, nothing to unlock");
  assert.equal(olderFrom([], now), null);
});

test("the CSV is one row a day, in major units, with the card name escaped", () => {
  const csv = historyCsv([{ t: Date.UTC(2026, 9, 1), v: 1234 }], { card: 'Jinx, "Loose" Cannon', market: "AU", currency: "AUD" });
  assert.equal(csv, 'date,card,market,currency,lowest_price\n2026-10-01,"Jinx, ""Loose"" Cannon",AU,AUD,12.34\n');
});

test("the full series and the CSV are members only, never cached publicly", () => {
  for (const f of ["src/app/api/card/[id]/history/full/route.ts", "src/app/api/card/[id]/history.csv/route.ts", "src/app/api/card/[id]/graded-history/route.ts"]) {
    const src = read(f);
    assert.match(src, /getCurrentUser\(\)/, `${f} reads the session`);
    assert.match(src, /isPremium\(/, `${f} checks the tier`);
    assert.match(src, /plus_required/, `${f} refuses a free account`);
    assert.match(src, /private, no-store/, `${f} must not be cached by the CDN`);
  }
  // The public route serves only the free window.
  assert.match(read("src/app/api/card/[id]/history/route.ts"), /points: recentWindow\(all\)/);
});

// ── Graded tracking ─────────────────────────────────────────────────────────

test("grade labels, the daily snapshot and the grade order", () => {
  assert.equal(gradeLabel("psa", 10), "PSA 10");
  assert.equal(gradeLabel("BGS", 9.5), "BGS 9.5");
  assert.equal(gradeLabel(null, 10), "Graded");
  assert.equal(gradeLabel("PSA", null), "Graded");
  const snap = gradedSnapshot([
    { cardId: "a", priceCents: 5000, currency: "USD", grader: "PSA", grade: 10 },
    { cardId: "a", priceCents: 4000, currency: "USD", grader: "PSA", grade: 10 },
    { cardId: "a", priceCents: 3000, currency: "USD", grader: "PSA", grade: 9 },
    { cardId: "a", priceCents: 100, currency: "USD", grader: null, grade: null },
    { cardId: "a", priceCents: 0, currency: "USD", grader: "PSA", grade: 8 },
  ]);
  assert.deepEqual(snap.sort((x, y) => compareGrades(x.grade, y.grade)), [
    { cardId: "a", grade: "PSA 10", usdCents: 4000 },
    { cardId: "a", grade: "PSA 9", usdCents: 3000 },
  ]);
  assert.deepEqual(["PSA 9", "BGS 9.5", "PSA 10", "BGS 10"].sort(compareGrades), ["BGS 10", "PSA 10", "BGS 9.5", "PSA 9"]);
});

test("a graded watch: first sighting is a silent baseline, then only a material drop emails, once a day", () => {
  const w = { lastLowCents: null, lastEmailedCents: null, lastNotifiedAt: null, snoozedUntil: null };
  assert.equal(shouldEmailGraded(w, 10000, NOW), "first");
  const seen = { ...w, lastLowCents: 10000 };
  assert.equal(shouldEmailGraded(seen, 9990, NOW), "no", "a cent is not news");
  assert.equal(shouldEmailGraded(seen, 8000, NOW), "drop");
  assert.equal(shouldEmailGraded({ ...seen, lastNotifiedAt: new Date(NOW.getTime() - 3600_000) }, 8000, NOW), "cooldown");
  assert.equal(shouldEmailGraded({ ...seen, snoozedUntil: new Date(NOW.getTime() + DAY) }, 8000, NOW), "snoozed");
});

test("the cheapest slab per card, market and grade, in the market's currency", () => {
  const row = (over: object) => ({ cardId: "a", country: "US", priceCents: 5000, currency: "USD", grader: "PSA", grade: 10, title: "t", url: "u", updatedAt: NOW, ...over });
  const lows = cheapestByGrade([row({}), row({ priceCents: 4500, url: "cheap" }), row({ country: "AU", currency: "AUD", priceCents: 9000 }), row({ grader: null })]);
  assert.equal(lows.get("a|US|PSA 10")?.priceCents, 4500);
  assert.equal(lows.get("a|US|PSA 10")?.url, "cheap");
  assert.equal(lows.get("a|AU|PSA 10")?.priceCents, 9000);
  assert.equal(lows.size, 2, "an unnamed slab is not a series");
});

test("graded day files are public data: card, grade and a USD price only", () => {
  const store = read("src/lib/price-history-store.ts");
  assert.match(store, /GRADED_HISTORY_SUBDIR = "graded"/);
  const imp = read("src/lib/price-import.ts");
  assert.match(imp, /writeGradedHistoryDay\(/, "every import snapshots the graded listings");
  assert.match(read("src/app/api/cron/price-alerts/paid/route.ts"), /runGradedWatches\(/);
});

// ── Auction alerts ──────────────────────────────────────────────────────────

const JINX = { id: "c1", slug: "jinx-loose-cannon-ogn-202", name: "Jinx, Loose Cannon", setCode: "OGN", collectorNumber: "202/298", isPromo: false };

test("an auction matches a watched card by the eBay pass's own identity rules", () => {
  const id = identityOf(JINX);
  assert.ok(auctionMatchesCard({ title: "Riftbound Jinx, Loose Cannon OGN 202/298 PSA 10" }, id), "a slab of the card counts");
  assert.ok(auctionMatchesCard({ title: "Riftbound Jinx Loose Cannon 202/298 Origins" }, id));
  assert.ok(!auctionMatchesCard({ title: "Riftbound Jinx Loose Cannon 203/298" }, id), "another collector number");
  assert.ok(!auctionMatchesCard({ title: "Riftbound lot x10 Jinx 202/298" }, id), "a lot");
  assert.ok(!auctionMatchesCard({ title: "Riftbound Jinx, Loose Cannon 202/298 Chinese" }, id), "a foreign printing");
});

function auctionDb(opts: { premiumTier?: string; paused?: string[]; sent?: { email: string; itemId: string; country: string }[] } = {}) {
  const created: unknown[] = [];
  const auction = (itemId: string, title: string, hours: number, country = "AU") => ({
    itemId,
    country,
    title,
    url: `https://ebay/${itemId}`,
    currentBidCents: 1000,
    currency: "AUD",
    bidCount: 2,
    endsAt: new Date(NOW.getTime() + hours * 3600_000),
  });
  const user = { email: "Fan@Example.com", isAdmin: false, premiumUntil: new Date(NOW.getTime() + 30 * DAY), premiumTier: opts.premiumTier ?? "premium", premiumTierFloor: null, auctionAlertsSnoozedUntil: null };
  const empty = async () => [];
  const db = {
    auctionAlertSent: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => opts.sent ?? [],
      createMany: async ({ data }: { data: unknown[] }) => {
        created.push(...data);
        return { count: data.length };
      },
      groupBy: empty,
    },
    ebayAuctionListing: {
      findMany: async () => [
        auction("i1", "Riftbound Jinx, Loose Cannon 202/298 PSA 10", 5),
        auction("i2", "Riftbound Jinx Loose Cannon 202/298", 2),
        auction("i3", "Riftbound Jinx Loose Cannon 202/298", 2, "US"),
        auction("i4", "Riftbound Ahri 001/298", 1),
      ],
    },
    priceAlert: {
      findMany: async () => [{ email: "fan@example.com", market: "AU", userId: "u1", card: JINX, user }],
      groupBy: empty,
    },
    alertMute: { findMany: async () => (opts.paused ?? []).map((email) => ({ email })) },
    sealedWatch: { groupBy: empty },
    deckWatch: { findMany: empty },
    gradedWatch: { groupBy: empty },
  };
  return { db: db as never, created };
}

test("a Premium member gets one email with their market's matching auctions, soonest first, and each is sent once", async () => {
  const { db, created } = auctionDb();
  const sends: { to: string; items: { itemId: string }[] }[] = [];
  const s = await runAuctionAlerts({ db, now: NOW, dailyBudget: 100, send: async (to, items) => (sends.push({ to, items: items as never }), true) });
  assert.equal(s.emails, 1);
  assert.equal(sends[0]!.to, "fan@example.com");
  assert.deepEqual(sends[0]!.items.map((i) => i.itemId), ["i2", "i1"], "AU only, ending soonest first, no Ahri");
  assert.deepEqual((created as { itemId: string }[]).map((r) => r.itemId).sort(), ["i1", "i2"]);
  const again = auctionDb({ sent: [{ email: "fan@example.com", itemId: "i1", country: "AU" }, { email: "fan@example.com", itemId: "i2", country: "AU" }] });
  const s2 = await runAuctionAlerts({ db: again.db, now: NOW, dailyBudget: 100, send: async () => assert.fail("already sent") });
  assert.equal(s2.alreadySent, 2);
  assert.equal(s2.emails, 0);
});

test("Plus is not Premium, and a paused address is skipped", async () => {
  const plus = await runAuctionAlerts({ db: auctionDb({ premiumTier: "plus" }).db, now: NOW, dailyBudget: 100, send: async () => assert.fail("Plus has no auction alerts") });
  assert.equal(plus.lapsed, 1);
  const paused = await runAuctionAlerts({ db: auctionDb({ paused: ["fan@example.com"] }).db, now: NOW, dailyBudget: 100, send: async () => assert.fail("paused") });
  assert.equal(paused.paused, 1);
});

test("the auction route fails closed and runs after every auction sweep", () => {
  const route = read("src/app/api/cron/auction-alerts/route.ts");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /liveRoute\(/);
  assert.match(read(".github/workflows/refresh-auctions.yml"), /\/api\/cron\/auction-alerts/);
});
