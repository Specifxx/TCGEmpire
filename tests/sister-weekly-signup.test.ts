import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claimMailSlot, mailCapKey, mailLane, DEX_DAILY_MAIL_CAP, SISTER_DAILY_MAIL_CAP } from "../src/lib/sister-alerts/mail-cap";
import { DIGEST_MAIL_CEILING } from "../src/lib/sister-alerts/digest";
import { buildWeeklyConfirmEmail } from "../src/lib/sister-alerts/email";
import { signupLines } from "../src/lib/sister-alerts/report";

// DECISIONS.md, "A weekly-drops sign-up with no alert, and DexCompare's own mail lane" (2026-11-12).

const now = new Date("2026-11-12T10:00:00Z");

function counterDb() {
  const rows = new Map<string, number>();
  return {
    rows,
    db: {
      counter: {
        upsert: async ({ where }: { where: { key: string } }) => {
          const value = (rows.get(where.key) ?? 0) + 1;
          rows.set(where.key, value);
          return { key: where.key, value };
        },
      },
    } as never,
  };
}

test("Dex mail counts on its own lane only while its Brevo key is set", () => {
  assert.equal(mailLane("dex", { DEX_BREVO_API_KEY: "k" }), "dex");
  assert.equal(mailLane("dex", {}), "shared");
  assert.equal(mailLane("dex", { DEX_BREVO_API_KEY: "  " }), "shared");
  assert.equal(mailLane("mtg", { DEX_BREVO_API_KEY: "k" }), "shared");
  assert.equal(mailLane(undefined, { DEX_BREVO_API_KEY: "k" }), "shared");
  assert.equal(mailCapKey(now), "sister-alerts:mail:2026-11-12", "the shared key is unchanged");
  assert.equal(mailCapKey(now, "dex"), "sister-alerts:mail:dex:2026-11-12");
  assert.ok(DEX_DAILY_MAIL_CAP <= 300, "inside Brevo's free 300 a day");
});

test("the two lanes never spend each other's day, and each stops at its own cap", async () => {
  const { db, rows } = counterDb();
  const env = { DEX_BREVO_API_KEY: "k" };
  for (let i = 0; i < DEX_DAILY_MAIL_CAP; i++) assert.equal(await claimMailSlot(db, now, undefined, "dex", env), true);
  assert.equal(await claimMailSlot(db, now, undefined, "dex", env), false, "Dex stops at its cap");
  assert.equal(rows.get(mailCapKey(now)), undefined, "and spent nothing of the shared day");
  for (let i = 0; i < SISTER_DAILY_MAIL_CAP; i++) assert.equal(await claimMailSlot(db, now, undefined, "mtg", env), true);
  assert.equal(await claimMailSlot(db, now, undefined, "mtg", env), false);

  // The weekly email keeps the same reserve for alerts and confirmations on either lane.
  const d = counterDb();
  const reserve = SISTER_DAILY_MAIL_CAP - DIGEST_MAIL_CEILING;
  for (let i = 0; i < DEX_DAILY_MAIL_CAP - reserve; i++) assert.equal(await claimMailSlot(d.db, now, DIGEST_MAIL_CEILING, "dex", env), true);
  assert.equal(await claimMailSlot(d.db, now, DIGEST_MAIL_CEILING, "dex", env), false);

  // Without the key Dex is an ordinary site on the shared 30.
  const s = counterDb();
  for (let i = 0; i < SISTER_DAILY_MAIL_CAP; i++) assert.equal(await claimMailSlot(s.db, now, undefined, "dex", {}), true);
  assert.equal(await claimMailSlot(s.db, now, undefined, "dex", {}), false);
  assert.equal(await claimMailSlot({ counter: { upsert: async () => { throw new Error("down"); } } } as never, now, undefined, "dex", env), false, "fails closed");
});

test("the weekly-only confirmation names the site, the region and one confirm link", () => {
  const m = buildWeeklyConfirmEmail("dex", "tok_1", "UK");
  assert.match(m.subject, /^Confirm your DexCompare weekly price drops$/);
  assert.match(m.html, /sister-alerts\/confirm\?t=tok_1/);
  assert.match(m.text, /sister-alerts\/confirm\?t=tok_1/);
  assert.match(m.text, /ignore this email and nothing will be sent/);
  assert.ok(!/price alert/i.test(m.text), "it promises no alert");
});

test("the sign-up route takes a weekly-only request with no product and keeps its rails", () => {
  const src = readFileSync("src/app/api/sister-alerts/route.ts", "utf8");
  assert.match(src, /kind: z\.enum\(\["price", "restock", "weekly"\]\)/);
  assert.match(src, /if \(kind === "weekly"\)/);
  const weekly = src.slice(src.indexOf("async function weeklyOnly"));
  assert.match(weekly, /rateLimit\(/);
  assert.match(weekly, /claimMailSlot\(prisma, now, undefined, site\)/);
  assert.match(weekly, /buildWeeklyConfirmEmail/);
  assert.ok(!/sisterAlert\.(create|upsert)/.test(weekly), "a weekly sign-up creates no alert");
  assert.match(src, /!email \|\| !targetCents \|\| !productId/, "an alert still needs a product and a price");
  const where = src.indexOf('if (kind === "weekly")');
  assert.ok(src.indexOf("site !== fromSite.key") < where && src.indexOf("allowedOrigin(origin)") < where, "origin and site are checked first");
});

test("the Monday report's sign-up lines are counts only", () => {
  assert.deepEqual(signupLines(null), []);
  const lines = signupLines({ sites: { dex: { alerts: 4, alertsNew: 3, weekly: 9, weeklyNew: 9 } }, addresses: 11, confirmed: 7 });
  assert.equal(lines[0], "Addresses: 11 signed up, 7 confirmed by email.");
  assert.equal(lines[1], "DexCompare: 4 price alerts (+3 this week), 9 on the weekly email (+9).");
  assert.match(lines[2]!, /^None yet: /);
  assert.ok(!lines.join(" ").includes("@"));
});
