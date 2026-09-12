import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activityUpdate, ACTIVITY_STAMP_INTERVAL_MS } from "../src/lib/activity";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const readCode = (p: string) =>
  read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// lastLoginAt answered the wrong question. Sessions are long-lived JWTs and it
// is stamped in exactly one place (the OAuth callback), so it records
// AUTHENTICATION — an event a daily visitor might not repeat for months. The
// accounts dashboard's "Signed in · 7d" therefore counted people who happened
// to re-authenticate that week, not people who showed up, and the loyalty page
// said outright it could not rank by visit frequency at all.
//
// lastActiveAt + activeDays answer "when did they last USE it" and "how many
// distinct days have they used it".
// ─────────────────────────────────────────────────────────────────────────────

// Sydney, because activityUpdate buckets days with the same sydneyDay() the
// price snapshots use. NOTE THE OFFSET: September is AEST (UTC+10), not AEDT —
// DST starts in October — so midnight Sydney is 14:00 UTC, not 13:00. Writing
// this test against +11 is what caught that the fixture, not the code, was
// wrong; a rollover test aimed at the wrong hour silently proves nothing.
const at = (iso: string) => new Date(iso);

test("a first-ever visit starts the count", () => {
  const r = activityUpdate({ lastActiveAt: null, activeDays: 0 }, at("2026-09-11T02:00:00Z"));
  assert.ok(r);
  assert.equal(r!.activeDays?.increment, 1);
  assert.deepEqual(r!.lastActiveAt, at("2026-09-11T02:00:00Z"));
});

test("a second page view moments later writes NOTHING", () => {
  // The whole cost argument. getCurrentUser runs on essentially every
  // authenticated render, so without this every page view is an UPDATE on the
  // hottest path in an app that has repeatedly exhausted a 5 GB Neon transfer
  // allowance in about three days.
  const last = at("2026-09-11T02:00:00Z");
  assert.equal(activityUpdate({ lastActiveAt: last, activeDays: 3 }, at("2026-09-11T02:00:05Z")), null);
  assert.equal(activityUpdate({ lastActiveAt: last, activeDays: 3 }, at("2026-09-11T02:29:00Z")), null);
});

test("a stale same-day visit refreshes the timestamp but does NOT count a second day", () => {
  const last = at("2026-09-11T02:00:00Z");
  const r = activityUpdate({ lastActiveAt: last, activeDays: 3 }, at("2026-09-11T03:00:00Z"));
  assert.ok(r, "past the throttle window, so the timestamp must refresh");
  assert.equal(r!.activeDays, undefined, "same Sydney day — activeDays must not move");
});

test("a new calendar day always counts, even four minutes later", () => {
  // 13:58 UTC is 23:58 Sydney; 14:02 UTC is 00:02 the next Sydney day. Four
  // minutes apart, well inside the throttle window, and genuinely two days —
  // if the throttle were checked first this would be silently dropped.
  const r = activityUpdate({ lastActiveAt: at("2026-09-11T13:58:00Z"), activeDays: 9 }, at("2026-09-11T14:02:00Z"));
  assert.ok(r, "a day rollover must write regardless of how recent the last stamp was");
  assert.equal(r!.activeDays?.increment, 1);
});

test("days are counted, not visits — ten separate days beats one long binge", () => {
  // Ten sessions inside one Sydney day counts once…
  let days = 0;
  let last: Date | null = null;
  for (let h = 0; h < 10; h++) {
    const now = at(`2026-09-11T${String(h).padStart(2, "0")}:30:00Z`);
    const u = activityUpdate({ lastActiveAt: last, activeDays: days }, now);
    if (u) {
      last = u.lastActiveAt;
      if (u.activeDays) days += 1;
    }
  }
  assert.equal(days, 1, "one Sydney day of heavy use is one active day");

  // …while one visit on each of ten days counts ten.
  days = 0;
  last = null;
  for (let d = 1; d <= 10; d++) {
    const u = activityUpdate({ lastActiveAt: last, activeDays: days }, at(`2026-09-${String(d).padStart(2, "0")}T02:00:00Z`));
    assert.ok(u);
    last = u!.lastActiveAt;
    if (u!.activeDays) days += 1;
  }
  assert.equal(days, 10);
});

test("the stamp is fire-and-forget and never blocks a render", () => {
  const src = readCode("src/lib/activity.ts");
  assert.match(src, /void prisma\.user\.update\(/, "must not be awaited — this runs on every authenticated render");
  assert.match(src, /\.catch\(\(\) => \{/, "a failed bookkeeping write must never surface to the visitor");

  const auth = readCode("src/lib/auth.ts");
  assert.match(auth, /touchActivity\(user\)/, "getCurrentUser must stamp activity");
  assert.doesNotMatch(auth, /await touchActivity/, "awaiting it would add a write to every page's critical path");
  // It must read the row it already has rather than issue its own query.
  const at_ = auth.indexOf("findUnique");
  assert.ok(at_ >= 0 && auth.indexOf("touchActivity(user)") > at_, "must reuse the row getCurrentUser already loaded");
});

test("the throttle is a real window, not a token gesture", () => {
  assert.ok(
    ACTIVITY_STAMP_INTERVAL_MS >= 5 * 60_000,
    "anything under five minutes puts the write rate back on the same order as the page-view rate",
  );
});

test("the accounts dashboard reports activity, not authentication", () => {
  const src = read("src/app/admin/accounts/page.tsx");
  assert.match(src, /Last active/, "the column must be Last active");
  assert.doesNotMatch(src, /<th[^>]*>Last login<\/th>/, "the Last login column must be gone");
  assert.match(src, /label="Active · 7d"/, "the 7-day stat must count use, not sign-ins");
  // lastLoginAt survives only as the fallback for rows predating the column —
  // an account that has not been back since is shown its last login, which is
  // a genuine lower bound, and the query counts it the same way.
  assert.match(
    src,
    /\{ OR: \[\{ lastActiveAt: \{ gte: d7 \} \}, \{ lastActiveAt: null, lastLoginAt: \{ gte: d7 \} \}\] \}/,
    "the active filter/count must fall back to lastLoginAt only where activity was never recorded",
  );
});

test("the loyalty page ranks by days used, and says so where it can't yet", () => {
  const src = read("src/app/admin/loyalty/page.tsx");
  assert.match(src, /Most active/, "there must be a most-active section");
  assert.match(src, /orderBy: \[\{ activeDays: "desc" \}, \{ lastActiveAt: "desc" \}\]/, "ranked by days used");
  // Before anyone is counted every row ties on zero, so an unfiltered top-N
  // would present an arbitrary 25 accounts as the most engaged.
  assert.match(src, /activeDays: \{ gt: 0 \}/, "accounts with no counted days must be excluded, not shown as ties");
  assert.match(src, /No activity counted yet/, "the empty state must explain that counting starts at deploy");
  // The stale claim that this data doesn't exist must be gone.
  assert.doesNotMatch(src, /no login\/visit-frequency tracking in the app today/);
  assert.match(src, /"Active"/, "activity must feed the multi-signal cross-tab too");
});

test("the columns are additive, so the deploy's db push applies them", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /lastActiveAt\s+DateTime\?/, "nullable — no backfill required");
  assert.match(schema, /activeDays\s+Int\s+@default\(0\)/, "defaulted — every existing row stays valid");
});
