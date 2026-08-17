import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// A handful of API routes touched the DB with no try/catch at all — on a DB
// blip (this project's Neon egress allowance has repeatedly been exhausted,
// see lib/db.ts's fallback-chain comments) they'd 500 with Next's generic
// unhandled-error page instead of a clean JSON error. This locks in the fix:
// every DB-touching route below must degrade into a JSON { error } response,
// matching the pattern already established by e.g. api/feedback/route.ts.
// ─────────────────────────────────────────────────────────────────────────────

const DB_ROUTES = [
  "src/app/api/collection/route.ts",
  "src/app/api/listings/route.ts",
  "src/app/api/notifications/route.ts",
  "src/app/api/riftle/route.ts",
];

for (const route of DB_ROUTES) {
  test(`${route} wraps its DB-touching handlers in try/catch with a JSON 500`, () => {
    const code = readCode(route);
    assert.match(code, /try\s*\{/, "must have at least one try block");
    assert.match(code, /catch\s*\{[\s\S]*?status:\s*500/, "a catch path must return a JSON error with status 500");
  });
}

test("the listings DELETE (cancel-a-listing) path is wrapped too, not just POST", () => {
  const code = readCode("src/app/api/listings/route.ts");
  const deleteAt = code.indexOf("export async function DELETE");
  assert.ok(deleteAt >= 0, "expected a DELETE handler");
  const body = code.slice(deleteAt);
  assert.match(body, /try\s*\{/, "DELETE must also be wrapped — cancelling a listing is real-money-adjacent");
});

test("MyCollection distinguishes a failed fetch from a genuinely empty collection", () => {
  const code = readCode("src/components/MyCollection.tsx");
  assert.match(code, /loadError/, "must track a distinct error state, not fold failure into items:[]");
  assert.doesNotMatch(
    code,
    /\.catch\(\(\)\s*=>\s*setItems\(\[\]\)\)/,
    "a fetch failure must not be indistinguishable from an empty collection"
  );
  assert.match(code, /Couldn't load your collection/, "the error state must be user-visible, not silent");
  assert.match(code, /Try again/, "the error state must offer a retry, not just fail silently");
});

test("the OAuth callback survives a session-creation failure instead of throwing raw out of sign-in", () => {
  const code = readCode("src/app/api/auth/oauth/[provider]/callback/route.ts");
  const at = code.indexOf("upsertOAuthUser(provider");
  assert.ok(at >= 0, "expected the find-or-create + link call");
  // The try must wrap both the lookup/link AND createSession — a DB blip or a
  // misconfigured AUTH_SECRET (lib/auth.ts's getSecret() throws in that case)
  // must redirect to a friendly error, not crash the callback.
  const before = code.slice(Math.max(0, at - 300), at);
  assert.match(before, /try\s*\{/, "the OAuth linking + session creation must be wrapped in try/catch");
  assert.match(code, /createSession\(user\.id\)/, "session creation must still happen inside the guarded path");
  assert.match(code, /oauth_session/, "a failure here must redirect to a distinct, user-facing error code");
});

test("AuthForm has copy for the new oauth_session error code", () => {
  const code = readCode("src/components/AuthForm.tsx");
  assert.match(code, /oauth_session:/, "the error map must cover the new failure code");
});
