import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST_SIGN_IN_FALLBACK } from "../src/lib/next-param";

// Where someone lands after signing in (2026-09-29, owner-approved):
//   1. back to the page the sign-in started on, finishing what they started
//      (unchanged: ?next= on every contextual entry point, the pending watch);
//   2. with nowhere to return to, /dashboard — the signed-in hub — not the
//      /profile settings page;
//   3. a brand-new account: the setup checklist first on /dashboard, or a
//      one-time "your free account is ready" toast on the page they return to;
//   4. no Premium slide-in for the rest of the sign-up session.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("with nowhere to return to, a sign-in lands on /dashboard", () => {
  assert.equal(POST_SIGN_IN_FALLBACK, "/dashboard");
  assert.match(code("src/app/api/auth/oauth/[provider]/callback/route.ts"), /new URL\(next \?\? POST_SIGN_IN_FALLBACK, req\.url\)/);
  assert.match(code("src/app/login/page.tsx"), /if \(user\) redirect\(next \?\? POST_SIGN_IN_FALLBACK\);/, "an already-signed-in visitor too");
  for (const f of ["src/app/api/auth/oauth/[provider]/callback/route.ts", "src/app/login/page.tsx"]) {
    assert.doesNotMatch(code(f), /\?\? "\/profile"/, `${f}: /profile is no longer the landing`);
  }
});

test("a brand-new account is greeted as new, with the setup checklist first on the dashboard", () => {
  const dash = code("src/app/dashboard/page.tsx");
  assert.match(dash, /const isNewAccount = Date\.now\(\) - user\.createdAt\.getTime\(\) < NEW_ACCOUNT_MS;/);
  assert.match(dash, /\{isNewAccount \? "Welcome" : "Welcome back"\}, \{user\.displayName\}/);
  const checklist = dash.indexOf("<WelcomeChecklist />");
  assert.ok(checklist > 0 && checklist < dash.indexOf("<WatchlistSnapshot"), "the checklist comes before the snapshots");
  assert.match(code("src/lib/auth.ts"), /lastActiveAt: true, activeDays: true, createdAt: true,/, "read from the row getCurrentUser already loads");
  // It shows on the very landing, however its effect is ordered against SignupWelcome's.
  assert.match(code("src/components/WelcomeChecklist.tsx"), /\|\| isSignupSession\(\)\) setEligible\(true\);/);
});

test("a new account returned to its page gets one quiet 'account ready' toast pointing at the dashboard", () => {
  const w = code("src/components/SignupWelcome.tsx");
  assert.match(w, /markSignupSession\(\);/);
  assert.match(w, /if \(pathname !== "\/dashboard"\) \{\s*setToast\("Your free account is ready\."\);\s*setToastAction\(\{ href: "\/dashboard", label: "Get set up →" \}\);/);
  // A completed pending watch is more specific, so its toast takes over and drops the action.
  assert.equal((w.match(/setToastAction\(null\);/g) ?? []).length, 2);
  assert.match(w, /action=\{\s*toastAction \?/);
});

test("the Premium slide-in stays away for the whole sign-up session", () => {
  const slide = code("src/components/PremiumSlideIn.tsx");
  const guard = slide.indexOf("if (isSignupSession()) return;");
  assert.ok(guard > 0, "guarded");
  assert.ok(guard < slide.indexOf("const t = setTimeout("), "before the show timer is armed");
});

test("isSignupSession: the session flag, or the ?welcome landing before it is written", async () => {
  const { isSignupSession, markSignupSession } = await import("../src/lib/signup-session");
  assert.equal(isSignupSession(), false, "no window (server): never");
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  g.window = { location: { search: "" } };
  try {
    assert.equal(isSignupSession(), false);
    (g.window as { location: { search: string } }).location.search = "?welcome=google";
    assert.equal(isSignupSession(), true, "the landing URL counts before SignupWelcome runs");
    (g.window as { location: { search: string } }).location.search = "";
    markSignupSession();
    assert.equal(isSignupSession(), true, "and the rest of the session after it strips the param");
  } finally {
    delete g.window;
    delete g.sessionStorage;
  }
});
