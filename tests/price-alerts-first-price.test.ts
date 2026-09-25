import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIRST_CONTACT_SEND_CAP, FIRST_PRICE_SEND_CAP, isFirstPrice, runPriceAlerts, type AlertRunDeps } from "../src/lib/price-alerts";
import { dropRow, priceDropCopy, type PriceDropItem } from "../src/lib/email";

// ─────────────────────────────────────────────────────────────────────────────
// "Get a price-drop alert" on a card no store lists yet used to be a promise the
// run could never keep. Both watch-creation paths store lastPriceCents =
// pickPrice(...), which is null for an unpriced card; runPriceAlerts() skipped a
// null price and emailed only when `prev != null && current < prev`, so the
// FIRST price silently became the baseline. Someone watching a Radiance reveal
// heard nothing when it finally listed at Pre-Rift or on release day.
//
// Now a null → priced move sends a separate "now in stock" notice. It shares
// the weekly per-address cap with drops and has its own per-run send cap, and
// both defer (baseline held at null) rather than drop the notice.
//
// These run the real runPriceAlerts() against a stub client and sender.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-16T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

type Row = {
  id: string;
  email: string;
  market: string;
  lastPriceCents: number | null;
  lowestEmailedCents: number | null;
  lastNotifiedAt: Date | null;
  unsubToken: string;
  userId: string | null;
  card: {
    id: string;
    name: string;
    slug: string | null;
    setCode: string;
    collectorNumber: string;
    lowestPriceCents: number | null;
    lowestPriceCentsUs: number | null;
    lowestPriceCentsUk: number | null;
    lowestPriceCentsSg: number | null;
    lowestPriceCentsCa: number | null;
    lowestPriceCentsEu: number | null;
  };
};

function row(id: string, over: Partial<Row> & { us?: number | null } = {}): Row {
  const { us = null, ...rest } = over;
  return {
    id,
    email: `${id}@example.com`,
    market: "US",
    lastPriceCents: null,
    lowestEmailedCents: null,
    lastNotifiedAt: null,
    unsubToken: `tok-${id}`,
    userId: null,
    card: {
      id: `card-${id}`,
      name: `Card ${id}`,
      slug: `card-${id}`,
      setCode: "RAD",
      collectorNumber: "001",
      lowestPriceCents: null,
      lowestPriceCentsUs: us,
      lowestPriceCentsUk: null,
      lowestPriceCentsSg: null,
      lowestPriceCentsCa: null,
      lowestPriceCentsEu: null,
    },
    ...rest,
  };
}

function harness(rows: Row[], sendOk = true) {
  const sent: { to: string; items: PriceDropItem[] }[] = [];
  const writes: { id: string; data: Record<string, unknown> }[] = [];
  const db = {
    priceAlert: {
      findMany: async () => rows,
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: args.where.id, data: args.data });
        return args;
      },
    },
    $transaction: async (ops: unknown[]) => ops,
  };
  const deps: AlertRunDeps = {
    db: db as unknown as AlertRunDeps["db"],
    sendPriceDropEmail: async (to, items) => {
      sent.push({ to, items });
      return sendOk;
    },
    now: NOW,
  };
  return { sent, writes, run: () => runPriceAlerts(deps) };
}

test("isFirstPrice: only never-priced → priced", () => {
  assert.equal(isFirstPrice(null, 500), true);
  assert.equal(isFirstPrice(null, null), false);
  assert.equal(isFirstPrice(700, 500), false, "a drop is not a first price");
  assert.equal(isFirstPrice(500, 700), false);
});

test("null → priced emails exactly one 'listed' item and writes the baseline", async () => {
  const h = harness([row("a", { us: 1299 })]);
  const summary = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.items.length, 1);
  const item = h.sent[0]!.items[0]!;
  assert.equal(item.kind, "listed");
  assert.equal(item.oldCents, null);
  assert.equal(item.newCents, 1299);
  assert.equal(summary.listed, 1);
  assert.equal(summary.drops, 0, "a first listing is not counted as a drop");
  assert.equal(summary.emails, 1);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0]!.data.lastPriceCents, 1299);
  assert.equal(h.writes[0]!.data.lowestEmailedCents, 1299, "the first price seeds the watermark");
  assert.deepEqual(h.writes[0]!.data.lastNotifiedAt, NOW);
});

test("a still-unpriced card does nothing", async () => {
  const h = harness([row("a")]);
  const summary = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(summary.listed, 0);
});

test("a quiet address keeps a null baseline, so the notice re-detects next run", async () => {
  const h = harness([row("a", { us: 999, lastNotifiedAt: daysAgo(2) })]);
  const summary = await h.run();
  assert.equal(h.sent.length, 0);
  assert.equal(summary.listed, 1);
  assert.equal(summary.deferred, 1);
  assert.equal(summary.held, 1);
  assert.equal(h.writes.length, 0, "no baseline write — lastPriceCents stays null");
});

test("the per-run send cap defers the overflow instead of dropping it", async () => {
  const rows = Array.from({ length: FIRST_PRICE_SEND_CAP + 5 }, (_, i) => row(`r${i}`, { us: 500 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, FIRST_PRICE_SEND_CAP);
  assert.equal(summary.listed, FIRST_PRICE_SEND_CAP + 5);
  assert.equal(summary.deferred, 5);
  assert.equal(summary.held, 5);
  assert.equal(h.writes.length, FIRST_PRICE_SEND_CAP, "the deferred five keep a null baseline");
});

test("several watched cards listing the same day share ONE digest, none deferred", async () => {
  // The release-day shape: one address, three Radiance cards, all listed at once.
  const rows = ["x", "y", "z"].map((id) => row(id, { email: "fan@example.com", us: 400 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]!.items.length, 3);
  assert.equal(summary.deferred, 0);
  assert.equal(h.writes.length, 3);
});

test("a joined digest does not count against the cap", async () => {
  // Cap-many distinct addresses open digests; one of them also has a second card.
  const rows = Array.from({ length: FIRST_PRICE_SEND_CAP }, (_, i) => row(`r${i}`, { us: 500 }));
  rows.push(row("extra", { email: "r0@example.com", us: 600 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, FIRST_PRICE_SEND_CAP);
  assert.equal(summary.deferred, 0);
});

test("priced → out of stock → priced again does NOT fire a first-price notice", async () => {
  // Out of stock: current is null, the loop skips it, and the baseline is untouched.
  const oos = harness([row("a", { lastPriceCents: 800, us: null })]);
  await oos.run();
  assert.equal(oos.writes.length, 0, "going out of stock never nulls the baseline");
  // Relisted higher: a rise, not a first price.
  const back = harness([row("a", { lastPriceCents: 800, us: 900 })]);
  const summary = await back.run();
  assert.equal(summary.listed, 0);
  assert.equal(back.sent.length, 0);
  assert.equal(back.writes[0]!.data.lastPriceCents, 900);
});

test("a failed send holds the first-price baseline at null for a retry", async () => {
  const h = harness([row("a", { us: 1000 })], false);
  const summary = await h.run();
  assert.equal(h.sent.length, 1);
  assert.equal(summary.emails, 0);
  assert.equal(summary.held, 1);
  assert.equal(h.writes.length, 0);
});

test("drops still send exactly as before", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, lowestEmailedCents: null, us: 800 })]);
  const summary = await h.run();
  assert.equal(summary.drops, 1);
  assert.equal(summary.listed, 0);
  assert.equal(h.sent[0]!.items[0]!.kind, "drop");
  assert.equal(h.sent[0]!.items[0]!.oldCents, 1000);
});

test("email copy: 'now in stock' for listings, unchanged for drops, no strikethrough on a listing", () => {
  const base = { name: "Radiant Hero", setCode: "RAD", collectorNumber: "001", url: "https://x/card/a", market: "US" as const };
  const listed: PriceDropItem = { ...base, kind: "listed", oldCents: null, newCents: 1299 };
  const drop: PriceDropItem = { ...base, kind: "drop", oldCents: 1500, newCents: 1299 };

  const l = priceDropCopy([listed]);
  assert.match(l.subject, /^Radiant Hero is now in stock from /);
  assert.match(l.heading, /now in stock/);
  assert.match(priceDropCopy([listed, { ...listed, name: "B" }]).subject, /2 of your wishlist cards are now in stock/);
  // A null baseline can be a sold-out card at watch time, so a listing notice
  // may be a restock: the copy never claims it is the card's first listing.
  assert.equal(l.intro, "A card you're watching is now in stock:");
  assert.equal(priceDropCopy([drop, listed]).intro, "Some cards you're watching got cheaper, and some are now in stock:");
  for (const c of [l, priceDropCopy([listed, { ...listed, name: "B" }]), priceDropCopy([drop, listed])]) {
    assert.doesNotMatch(`${c.heading} ${c.intro} ${c.subject}`, /first time/);
  }

  assert.match(priceDropCopy([drop]).subject, /^Price drop: Radiant Hero is now /);
  assert.equal(priceDropCopy([drop]).heading, "A wishlist card just got cheaper");
  assert.match(priceDropCopy([drop, listed]).subject, /Price drops and new listings on 2/);

  const row = dropRow(listed);
  assert.match(row, /Now in stock · from/);
  assert.doesNotMatch(row, /line-through/);
  assert.doesNotMatch(row, /NaN|Infinity/);
  assert.match(dropRow(drop), /line-through/);
});

test("the card page and CTA say 'in stock' for an unpriced card, never 'first'", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  const cta = read("src/components/PriceDropAlertCta.tsx");
  assert.match(cta, /unpriced\?: boolean/);
  assert.match(cta, /Get an email when it's in stock\. No store has it in stock yet\./);
  assert.match(cta, /We'll email you when it's in stock\./);
  // `unpriced` also covers a card listed days ago and sold out since, so neither
  // "first" nor "no store has it" holds for every card it is shown on.
  assert.doesNotMatch(cta, /first in stock|No store has it yet/);
  // "when", never "the day" — the weekly cap can hold the notice back.
  assert.doesNotMatch(cta, /the day it/);
  const page = read("src/app/card/[id]/page.tsx");
  assert.match(page, /unpriced=\{priceState\.isEmpty && !priceState\.noRetailChannel\}/);
  assert.match(read("src/components/PriceAlertModal.tsx"), /when this card is in stock or gets cheaper/);
  assert.match(read("src/app/alerts/page.tsx"), /Can I watch a card with no price yet\?/);
});

test("first-contact drop digests are capped per run; the overflow is deferred with its baseline held", async () => {
  // Review, 2026-09-25: /api/alerts/subscribe enrols any posted address, and
  // each one's first drop used to send at once — ~100 of them would spend the
  // Resend quota verification and password reset share.
  const rows = Array.from({ length: FIRST_CONTACT_SEND_CAP + 5 }, (_, i) => row(`n${i}`, { lastPriceCents: 1000, us: 800 }));
  // An address emailed before (outside its week) is not first contact, and is not counted.
  rows.push(row("known", { lastPriceCents: 1000, us: 800, lastNotifiedAt: daysAgo(30), lowestEmailedCents: 900 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(summary.drops, FIRST_CONTACT_SEND_CAP + 6);
  assert.equal(h.sent.length, FIRST_CONTACT_SEND_CAP + 1, "the cap's worth of new addresses, plus the known one");
  assert.ok(h.sent.some((m) => m.to === "known@example.com"), "an address emailed before is never held by this cap");
  assert.equal(summary.deferred, 5);
  assert.equal(summary.held, 5);
  const written = new Set(h.writes.map((w) => w.id));
  for (let i = FIRST_CONTACT_SEND_CAP; i < FIRST_CONTACT_SEND_CAP + 5; i++) assert.ok(!written.has(`n${i}`), `n${i} keeps its baseline, so the drop re-detects next run`);
});

test("a second card joining a first-contact digest already opened is not counted", async () => {
  const rows = Array.from({ length: FIRST_CONTACT_SEND_CAP }, (_, i) => row(`n${i}`, { lastPriceCents: 1000, us: 800 }));
  rows.push(row("second", { email: "n0@example.com", lastPriceCents: 700, us: 600 }));
  const h = harness(rows);
  const summary = await h.run();
  assert.equal(h.sent.length, FIRST_CONTACT_SEND_CAP);
  assert.equal(summary.deferred, 0);
});
