import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { shouldTouchLastSeen } from "../src/lib/activity";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// "Which users are active" — admin/active/page.tsx — is powered by
// User.lastSeenAt, a passive stamp touched by getCurrentUser() (lib/auth.ts)
// on every session it resolves, throttled so an active visitor writes at most
// once every ACTIVITY_TOUCH_INTERVAL_MS rather than on every page render.
// ─────────────────────────────────────────────────────────────────────────────

// ── shouldTouchLastSeen: the throttle (pure function — real assertions) ──────

test("shouldTouchLastSeen: never touched yet always touches", () => {
  assert.equal(shouldTouchLastSeen(null), true);
});

test("shouldTouchLastSeen: a fresh stamp does not touch again", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const justNow = new Date("2026-01-01T11:59:00Z"); // 1 minute ago
  assert.equal(shouldTouchLastSeen(justNow, now), false);
});

test("shouldTouchLastSeen: a stale stamp (past the throttle window) touches again", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const staleStamp = new Date("2026-01-01T11:00:00Z"); // 60 minutes ago
  assert.equal(shouldTouchLastSeen(staleStamp, now), true);
});

test("shouldTouchLastSeen: right at the 5-minute boundary does not yet touch", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const exactlyFiveMinAgo = new Date(now.getTime() - 5 * 60_000);
  // Strictly-greater-than in the implementation — exactly at the boundary is
  // still "fresh enough", one tick past it is stale. Pins the `>` (not `>=`).
  assert.equal(shouldTouchLastSeen(exactlyFiveMinAgo, now), false);
  assert.equal(shouldTouchLastSeen(new Date(exactlyFiveMinAgo.getTime() - 1), now), true);
});

// ── The write path: getCurrentUser touches lastSeenAt, never breaks sign-in ──

test("getCurrentUser touches lastSeenAt through the throttle, and swallows a failed write", () => {
  const src = read("src/lib/auth.ts");
  assert.match(src, /import \{ shouldTouchLastSeen \} from "\.\/activity"/, "the throttle must be the shared pure function, not reimplemented inline");
  const fn = src.slice(src.indexOf("export const getCurrentUser"));
  assert.match(fn, /if \(shouldTouchLastSeen\(user\.lastSeenAt\)\)/, "the write must be gated by the pure throttle, not inlined ad hoc");
  assert.match(
    fn,
    /prisma\.user\.update\(\{ where: \{ id: userId \}, data: \{ lastSeenAt: new Date\(\) \} \}\)\.catch\(\(\) => \{\}\)/,
    "a failed activity-stamp write must never surface as a sign-in error",
  );
  // AWAITED, not a detached/fire-and-forget promise — see the comment in
  // lib/auth.ts on why: a background write from inside a Server Component
  // render has no guaranteed lifetime on a serverless function once the
  // response has shipped.
  assert.match(fn, /await prisma\.user\.update/, "the touch must be awaited, not fired-and-forgotten");
});

// ── The schema: additive, nullable, indexed ──────────────────────────────────

test("User.lastSeenAt is nullable (additive push, no default backfilling every existing row)", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /lastSeenAt\s+DateTime\?/, "must be nullable with no @default — additive for existing accounts");
  assert.doesNotMatch(schema, /lastSeenAt\s+DateTime\?\s*@default/, "must not carry a @default that stamps every pre-existing row");
});

test("User.lastSeenAt is indexed — the admin page and the DAU/WAU/MAU counts filter on it directly", () => {
  const schema = read("prisma/schema.prisma");
  const userModel = schema.slice(schema.indexOf("model User "), schema.indexOf("\nmodel", schema.indexOf("model User ") + 1));
  assert.match(userModel, /@@index\(\[lastSeenAt\]\)/);
});

// ── The admin page: gated the same way every other admin tool is ────────────

test("admin/active exists, is gated like every other admin tool, and excludes seed accounts", () => {
  assert.ok(existsSync(join(process.cwd(), "src/app/admin/active/page.tsx")));
  const src = read("src/app/admin/active/page.tsx");
  assert.match(src, /robots: \{ index: false, follow: false \}/, "must self-noindex like the rest of /admin");
  assert.match(src, /if \(!\(keyOk \|\| me\?\.isAdmin\)\) notFound\(\)/, "must 404 (not redirect) for a non-admin, matching every other admin page");
  assert.match(src, /NOT_SEED_WHERE/, "must exclude the synthetic seed/dev-reset accounts from every count and the list, like /admin/accounts does");
});

test("admin/active is linked from the admin index", () => {
  const src = read("src/app/admin/page.tsx");
  assert.match(src, /href: "\/admin\/active"/);
});

test("the four activity windows (now/24h/7d/30d) all read the same lastSeenAt column", () => {
  const src = read("src/app/admin/active/page.tsx");
  const matches = [...src.matchAll(/lastSeenAt: \{ gte: /g)];
  assert.ok(matches.length >= 5, "expected a gte filter for each of the 4 summary counts plus the windowed list");
});
