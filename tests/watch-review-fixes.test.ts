import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RunBudget, WATCH_EMAILS_PER_ADDRESS } from "../src/lib/alert-budget";
import { PAID_SEND_CAP } from "../src/lib/price-alerts";
import { SEALED_WATCH_HARD_CAP, sealedWatchCeiling, sealedWatchLimit } from "../src/lib/alert-limits";
import { createSealedWatch, isRealSealedStore, sealedOfferState } from "../src/lib/sealed-watch";
import { buildDeckWatchEmail, buildSealedWatchEmail } from "../src/lib/watch-emails";
import { verifyAlertAction } from "../src/lib/alert-actions";
import { NOW, deckHarness, deckRow, group, hoursAgo, offer, premium, plus, sealedHarness, sealedRow } from "./helpers/watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// Review fixes for "Premium works while you're away" (2026-09-29): per-address
// email caps and the shared PAID_SEND_CAP, the restock clock seeded at creation,
// TCGplayer's reference row, a fresh sealed read, the List-Unsubscribe header,
// the Premium ceiling and the lapsed owner's own controls.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

const LISTINGS = [
  { cardId: "alpha", retailer: "mythicstore", priceCents: 1000 },
  { cardId: "beta", retailer: "mythicstore", priceCents: 2000 },
];
const owner = { ...premium, email: "one@example.com" };

// ── W2: one address, many watches ────────────────────────────────────────────

test("RunBudget: an address already opened costs no new slot, but is capped per address", () => {
  const b = new RunBudget(new Set(), 5, 5, 2);
  assert.equal(b.reason("a@x"), null);
  b.open("a@x");
  assert.equal(b.reason("a@x"), null, "the second email to an opened address needs no new slot");
  b.open("a@x");
  assert.equal(b.reason("a@x"), "address", "the third is over the per-address cap");
  assert.equal(b.newAddresses, 1, "one address opened, however many emails");
  assert.equal(b.reason("b@x"), null, "another address is unaffected");
  // Without a per-address cap (the card run's shape) nothing changes.
  const legacy = new RunBudget(new Set(), 5, 5);
  legacy.open("a@x");
  legacy.open("a@x");
  legacy.open("a@x");
  assert.equal(legacy.reason("a@x"), null);
  assert.equal(WATCH_EMAILS_PER_ADDRESS, 3);
});

test("sealed: 40 boxes restocking for ONE Premium member send WATCH_EMAILS_PER_ADDRESS emails; the rest keep their baseline and re-detect", async () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    sealedRow(`s${i}`, owner, { userId: "one", email: "one@example.com", groupKey: `K${i}`, lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(30), createdAt: new Date(NOW.getTime() - 90 * 86_400_000) }),
  );
  const groups = rows.map((r, i) => group([offer(16000)], { groupKey: `K${i}`, name: `Box ${i}` }));
  const h = sealedHarness(rows, { groups });
  const s = await h.run();
  assert.equal(s.restocks, 40, "all forty are worth telling");
  assert.equal(s.emails, WATCH_EMAILS_PER_ADDRESS, "…but one address gets at most three from one run");
  assert.equal(s.addressDeferred, 40 - WATCH_EMAILS_PER_ADDRESS);
  assert.equal(s.deferred, 40 - WATCH_EMAILS_PER_ADDRESS);
  assert.equal(s.newAddresses, 1);
  assert.equal(h.sent.length, WATCH_EMAILS_PER_ADDRESS);
  // A held watch keeps its baseline (soldOutAt stays, so the restock re-detects); a sent one is stamped.
  const held = rows.filter((r) => h.writeFor(r.id)?.lastNotifiedAt == null);
  assert.equal(held.length, 40 - WATCH_EMAILS_PER_ADDRESS);
  for (const r of held) assert.equal(h.writeFor(r.id)?.soldOutAt, undefined, "the restock clock is not cleared for a held watch");
});

test("deck: ten lists for ONE Premium member all dropping send WATCH_EMAILS_PER_ADDRESS emails, the rest held", async () => {
  const rows = Array.from({ length: 10 }, (_, i) => deckRow(`d${i}`, owner, { userId: "one", user: owner, lastTotalCents: 9999999 }));
  const h = deckHarness(rows, { listings: LISTINGS });
  const s = await h.run();
  assert.equal(s.drops, 10);
  assert.equal(s.emails, WATCH_EMAILS_PER_ADDRESS);
  assert.equal(s.addressDeferred, 10 - WATCH_EMAILS_PER_ADDRESS);
  assert.equal(s.newAddresses, 1);
  const held = rows.filter((r) => h.writeFor(r.id)?.lastNotifiedAt == null);
  assert.equal(held.length, 10 - WATCH_EMAILS_PER_ADDRESS);
  for (const r of held) assert.equal(h.writeFor(r.id)?.lastTotalCents, undefined, "a held list keeps its old total so it re-detects next run");
});

// ── F2: one PAID_SEND_CAP across the passes ──────────────────────────────────

test("sendCap: a pass opens no more new addresses than the cap it is handed", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => deckRow(`d${i}`, premium, { lastTotalCents: 9999999 }));
  const capped = deckHarness(rows, { listings: LISTINGS });
  const s = await capped.run({ sendCap: 1 });
  assert.equal(s.emails, 1);
  assert.equal(s.newAddresses, 1);
  assert.equal(s.deferred, 2);
  assert.equal(s.budgetDeferred, 0, "deferred by the cap, not the daily budget");
  const none = deckHarness(rows, { listings: LISTINGS });
  assert.equal((await none.run({ sendCap: 0 })).emails, 0, "a card run that used the whole cap leaves none for the deck pass");

  const sRows = Array.from({ length: 3 }, (_, i) => sealedRow(`s${i}`, plus, { groupKey: `K${i}`, lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(30) }));
  const sGroups = sRows.map((r, i) => group([offer(16000)], { groupKey: `K${i}` }));
  const sh = sealedHarness(sRows, { groups: sGroups });
  const ss = await sh.run({ sendCap: 2 });
  assert.equal(ss.emails, 2);
  assert.equal(ss.newAddresses, 2);
  assert.equal(ss.deferred, 1);
  // The default is PAID_SEND_CAP when no cap is handed in.
  assert.equal(PAID_SEND_CAP, 30);
});

test("the paid route hands each pass what the previous ones left of PAID_SEND_CAP", () => {
  const route = code("src/app/api/cron/price-alerts/paid/route.ts");
  assert.match(route, /const afterCards = Math\.max\(0, PAID_SEND_CAP - \("emails" in cards \? cards\.emails : 0\)\);/);
  assert.match(route, /runDeckWatches\(\{ sendCap: afterCards \}\)/);
  assert.match(route, /const afterDecks = Math\.max\(0, afterCards - \("newAddresses" in decks \? decks\.newAddresses : 0\)\);/);
  assert.match(route, /runSealedWatches\(\{ sendCap: afterDecks,/);
});

// ── W3: the restock clock starts when the member starts watching ──────────────

test("watched while sold out: the clock counts from creation, so a restock at the next run is told — even over RRP", async () => {
  // Run 1 (the member hearted a sold-out box 10h before this run): soldOutAt = createdAt, not now.
  const created = hoursAgo(10);
  const row = sealedRow("s1", plus, { createdAt: created, lastInStock: null, soldOutAt: null });
  const h1 = sealedHarness([row], { groups: [group([offer(15000, { inStock: false })])] });
  const s1 = await h1.run();
  assert.equal(s1.soldOut, 1);
  assert.deepEqual(h1.writeFor("s1")!.soldOutAt, created, "seeded from creation");
  // Run 2, 12h later: a real store has it at 16000 (RRP 14400 — over, no target, no earlier price).
  const later = new Date(NOW.getTime() + 12 * 3_600_000);
  const h2 = sealedHarness([sealedRow("s1", plus, { createdAt: created, lastInStock: false, soldOutAt: created })], {
    groups: [group([offer(16000, { lastSeen: new Date(later.getTime() - 3_600_000).toISOString() })])],
    now: later,
  });
  const s2 = await h2.run();
  assert.equal(s2.restocks, 1, "22h since creation ≥ 20h");
  assert.equal(h2.sent[0]!.item.kind, "sealed_restock");
  // A row that HAS been seen open starts its clock at now (a flap is not a long sell-out).
  const seenOpen = sealedHarness([sealedRow("s2", plus, { createdAt: hoursAgo(500), lastInStock: true })], { groups: [group([offer(15000, { inStock: false })])] });
  await seenOpen.run();
  assert.deepEqual(seenOpen.writeFor("s2")!.soldOutAt, NOW);
});

// ── F2 (review 2): TCGplayer's row is a reference, never stock ───────────────

test("TCGplayer's sealed row is a market-price reference: it never makes a product 'open', never restocks, never fires a price trigger", async () => {
  assert.equal(isRealSealedStore("tcgplayer"), false);
  const onlyRef = sealedOfferState([offer(15000, { retailer: "tcgplayer", retailerName: "TCGplayer" })], NOW);
  assert.equal(onlyRef.open, null);
  assert.equal(onlyRef.unknown, true, "decides nothing");
  // Sold out at every real store, TCGplayer 'open' (always inStock: true in the import): still sold out everywhere.
  const mixed = sealedOfferState([offer(15000, { inStock: false }), offer(9000, { retailer: "tcgplayer", retailerName: "TCGplayer" })], NOW);
  assert.equal(mixed.soldOutEverywhere, true);
  assert.equal(mixed.open, null);
  // The run: a US watch whose only 'open' row is TCGplayer's, at RRP and under the target, emails nothing.
  const rows = [sealedRow("s1", plus, { targetCents: 20000, lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(30) })];
  const h = sealedHarness(rows, { groups: [group([offer(14000, { retailer: "tcgplayer", retailerName: "TCGplayer" })])] });
  const s = await h.run();
  assert.equal(s.unknown, 1);
  assert.equal(h.sent.length, 0);
  // With a real store sold out beside it, the clock still runs.
  const h2 = sealedHarness([sealedRow("s1", plus, { lastInStock: true })], { groups: [group([offer(15000, { inStock: false }), offer(14000, { retailer: "tcgplayer", retailerName: "TCGplayer" })])] });
  const s2 = await h2.run();
  assert.equal(s2.soldOut, 1);
});

// ── F5: Premium's "unlimited" has a sanity ceiling ───────────────────────────

test("Premium sealed watches stop at SEALED_WATCH_HARD_CAP: create refuses, the run leaves the rest unevaluated", async () => {
  assert.equal(SEALED_WATCH_HARD_CAP, 200);
  assert.equal(sealedWatchLimit("premium"), Number.POSITIVE_INFINITY, "the marketing ladder still says unlimited");
  assert.equal(sealedWatchCeiling("premium"), SEALED_WATCH_HARD_CAP);
  assert.equal(sealedWatchCeiling("plus"), 10);
  assert.equal(sealedWatchCeiling(null), 0);
  const db = { sealedWatch: { count: async () => SEALED_WATCH_HARD_CAP, findFirst: async () => null, create: async () => ({}), update: async () => ({}), findMany: async () => [], deleteMany: async () => ({ count: 0 }) } };
  const res = await createSealedWatch(db as never, { id: "p", email: "p@example.com", ...premium }, { groupKey: "OGN|Booster Box" }, "US");
  assert.equal(res.status, 409);
  assert.equal(res.body.limit, SEALED_WATCH_HARD_CAP);
  const rows = Array.from({ length: SEALED_WATCH_HARD_CAP + 1 }, (_, i) => sealedRow(`s${i}`, owner, { userId: "one", email: "one@example.com", groupKey: `K${i}` }));
  const h = sealedHarness(rows, { groups: [] });
  const s = await h.run();
  assert.equal(s.overLimit, 1);
});

// ── F4: List-Unsubscribe stops one watch and is GET-safe ─────────────────────

test("the watch emails' List-Unsubscribe carries that watch's STOP token, and the URL answers GET with a redirect", async () => {
  const deckH = deckHarness([deckRow("w1", premium, { lastTotalCents: 9999999 })], { listings: LISTINGS });
  await deckH.run();
  const dHeader = buildDeckWatchEmail(deckH.sent[0]!.item).headers["List-Unsubscribe"]!;
  const sealedH = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(30) })], { groups: [group([offer(16000)])] });
  await sealedH.run();
  const sHeader = buildSealedWatchEmail(sealedH.sent[0]!.item).headers["List-Unsubscribe"]!;
  for (const [header, kind, id] of [[dHeader, "deck", "w1"], [sHeader, "sealed", "s1"]] as const) {
    const url = new URL(header.replace(/^<|>$/g, ""));
    assert.equal(url.pathname, "/api/alerts/action");
    const v = verifyAlertAction(url.searchParams.get("t"), NOW);
    assert.ok(v.ok && v.kind === kind && v.alertId === id && v.action === "stop", `${kind}: the one-click token is this watch's stop`);
  }
  const route = code("src/app/api/alerts/action/route.ts");
  assert.match(route, /export async function GET\(req: Request\)/, "a client that opens the URL in a browser is not answered 405");
  assert.match(route, /if \(!v\.ok \|\| v\.kind === "price" \|\| v\.action !== "stop"\)/, "one-click may only stop a deck or sealed watch");
});

// ── The sealed read is fresh when the ISR purge was skipped ──────────────────

test("the workflow asks for a fresh sealed read whenever it did not purge, and the run still reads getSealedGroups directly", async () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  assert.match(wf, /id: revalidate/);
  assert.match(wf, /echo "purged=true" >> "\$GITHUB_OUTPUT"/);
  assert.match(wf, /PURGED: \$\{\{ steps\.revalidate\.outputs\.purged \}\}/);
  assert.match(wf, /\[ "\$PURGED" = "true" \] \|\| fresh="\?fresh=1"/);
  assert.match(wf, /price-alerts\/paid\$fresh/);
  const route = code("src/app/api/cron/price-alerts/paid/route.ts");
  assert.match(route, /searchParams\.get\("fresh"\) === "1"/);
  const fresh = code("src/lib/sealed-fresh.ts");
  assert.match(fresh, /revalidateTag\(CONTENT_TAG\)/);
  assert.doesNotMatch(fresh, /revalidatePath/, "no page purge: that is what the 07:00 skip avoids");
  assert.doesNotMatch(fresh, /unstable_cache|cachedOrDirect/);
  // The run calls freshen once, before it reads, and only when it has entitled watches to read for.
  let calls = 0;
  const h = sealedHarness([sealedRow("s1", plus), sealedRow("s2", plus, { groupKey: "X|Y" })], { groups: [] });
  await h.run({ freshen: () => void calls++ });
  assert.equal(calls, 1);
  const none = sealedHarness([], { groups: [] });
  await none.run({ freshen: () => void calls++ });
  assert.equal(calls, 1, "nothing to read: nothing to bust");
  const boom = sealedHarness([sealedRow("s1", plus)], { groups: [] });
  await boom.run({ freshen: () => { throw new Error("no cache"); } });
});

// ── F3 (review 2): every tier summary names both watches ─────────────────────

test("the /premium tier lists name sealed watches and the deck price watch, with their limits from the constants", () => {
  // The FAQ's tier summaries ("What's free vs…", "Which plan is worth it?") went on
  // 2026-09-29 with the wordy page: "What you get" is now the one summary, a line
  // per feature, and it must still name both watches and quote their limits.
  const premiumPage = read("src/app/premium/page.tsx");
  assert.match(premiumPage, /tier: "plus", text: `Sealed watches for \$\{SEALED_WATCH_LIMIT_PLUS\} products: restock, RRP, your price`/);
  assert.match(premiumPage, /tier: "premium", text: `Deck price watch: \$\{DECK_WATCH_LIMIT\} saved lists, emailed at your price`/);
  assert.match(premiumPage, /tier: "premium", text: "Unlimited target-price alerts and sealed watches"/);
  const tools = read("src/app/tools/page.tsx");
  const faq = tools.slice(tools.indexOf('q: "Do I need an account'), tools.indexOf('q: "', tools.indexOf('q: "Do I need an account') + 10));
  const [plusBranch, premiumBranch] = faq.split("\n        : `");
  for (const b of [plusBranch, premiumBranch]) {
    assert.match(b, /sealed watches/);
    assert.match(b, /deck price watch/);
    assert.match(b, /\$\{DECK_WATCH_LIMIT\}/);
  }
});

// ── F3: a lapsed owner sees and can stop their rows ──────────────────────────

test("/watching shows the Sealed and Decks sections to a lapsed owner who still has rows, with the paid controls off", () => {
  const page = code("src/app/watching/page.tsx");
  assert.match(page, /\(member \|\| lapsedSealed > 0\) && \(/);
  assert.match(page, /\(onPremium \|\| lapsedDecks > 0\) && \(/);
  assert.match(page, /lapsed=\{!member\}/);
  assert.match(page, /lapsed=\{!onPremium\}/);
  for (const f of ["src/components/SealedWatchList.tsx", "src/components/DeckWatchList.tsx"]) {
    const c = code(f);
    assert.match(c, /data-lapsed-note/, `${f} says the watches resume on resubscribing`);
    assert.match(c, /disabled=\{lapsed\}/, `${f} turns the target edit off for a lapsed owner`);
  }
});
