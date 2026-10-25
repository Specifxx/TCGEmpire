import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInboxEmail, capKeys, MAX_PER_DAY, MAX_PER_HOUR } from "../src/lib/ops/notify-owner";
import { DEFAULT_OWNER_EMAIL, ownerEmail } from "../src/lib/ops/owner";
import { missingEnv, requiredEnvNames, siteSelfReport } from "../src/lib/ops/self-report";
import { OPERATIONAL_VARS } from "../src/lib/db-chains";
import { PUBLIC_MODELS } from "../src/lib/public-data/models";

// The glue around the ops monitor (DECISIONS.md, "The site watches itself", 2026-10-14):
// the instant inbox emails, the authenticated route, the admin pages and the workflow.

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the owner address is the one asked for, overridable, and validated", () => {
  assert.equal(DEFAULT_OWNER_EMAIL, "bill.jyang101@gmail.com");
  assert.equal(ownerEmail({}), DEFAULT_OWNER_EMAIL);
  assert.equal(ownerEmail({ OWNER_ALERT_EMAIL: "me@example.org" }), "me@example.org");
  assert.equal(ownerEmail({ OWNER_ALERT_EMAIL: "not an address" }), DEFAULT_OWNER_EMAIL);
  assert.equal(ownerEmail({ OWNER_ALERT_EMAIL: "a@b.c, other@x.y" }), DEFAULT_OWNER_EMAIL, "one address, never a list");
});

test("every public form tells the owner as soon as something is saved", () => {
  const forms: [string, RegExp][] = [
    ["src/app/api/contact/route.ts", /kind: "contact"/],
    ["src/app/api/feedback/route.ts", /kind: "feedback"/],
    ["src/app/api/price-report/route.ts", /kind: "price-report"/],
    ["src/app/api/stores/suggest/route.ts", /kind: "store-suggestion"/],
    ["src/app/api/support/route.ts", /kind: "support"/],
  ];
  for (const [file, kind] of forms) {
    const src = code(file);
    assert.match(src, /import \{ notifyOwnerBounded \} from "@\/lib\/ops\/notify-owner";/, file);
    assert.match(src, kind, file);
    // The notification comes AFTER the row is saved, never before: a failed email cannot lose a submission.
    const create = src.search(/\.create\(/);
    const notify = src.indexOf("notifyOwnerBounded({");
    assert.ok(create >= 0 && notify > create, `${file}: notify after create`);
  }
});

test("a notification cannot fail or delay a submission", () => {
  const src = code("src/lib/ops/notify-owner.ts");
  assert.match(src, /export async function notifyOwnerOfInboxItem[\s\S]*?try \{[\s\S]*?\} catch \{\s*return false;/, "swallows every error");
  assert.match(src, /Promise\.race\(\[notifyOwnerOfInboxItem\(item\)/, "bounded");
  assert.match(src, /clearTimeout\(timer\)/, "does not leave a timer holding the function open");
});

test("a flood of submissions cannot spend the day's email allowance", () => {
  assert.equal(MAX_PER_HOUR, 8);
  assert.equal(MAX_PER_DAY, 25);
  assert.ok(MAX_PER_DAY < 100, "Resend's free tier is 100 a day, shared with sign-in and price-alert mail");
  const k = capKeys(new Date("2026-10-14T06:30:00Z"));
  assert.equal(k.hour, "ops:inbox-mail:h:2026101406");
  assert.equal(k.day, "ops:inbox-mail:d:20261014");
  const src = code("src/lib/ops/notify-owner.ts");
  assert.match(src, /h\.value <= MAX_PER_HOUR && dday\.value <= MAX_PER_DAY/);
  assert.match(src, /catch \{\s*return true;/, "an unreadable counter fails open: a lost cap is better than a lost message");
});

test("the inbox email escapes what a stranger typed and shows the owner who to reply to", () => {
  const m = buildInboxEmail({
    kind: "contact",
    headline: "Hello <script>alert(1)</script>",
    from: "Eve <eve@example.com>",
    fields: [["Subject", "<b>hi</b>"]],
    body: "line one\n<img src=x onerror=1>",
  });
  assert.ok(!m.html.includes("<script>"));
  assert.ok(!m.html.includes("<img src=x"));
  assert.match(m.html, /Eve &lt;eve@example\.com&gt;/);
  assert.match(m.subject, /^\[RiftCompare inbox\] Contact message: /);
  assert.match(m.html, /riftcompare\.com\/admin\/messages/);
  assert.match(m.text, /Inbox: https:\/\/riftcompare\.com\/admin\/messages/);
  const long = buildInboxEmail({ kind: "feedback", headline: "x".repeat(500), body: "y".repeat(9000) });
  assert.ok(long.subject.length < 140);
  assert.ok(long.html.length < 12_000, "a huge submission cannot become a huge email");
});

test("the ops route fails closed, never takes a recipient from the request, and is a live route", () => {
  const src = code("src/app/api/cron/ops-notify/route.ts");
  assert.match(src, /const secret = process\.env\.CRON_SECRET;\s*if \(!secret\) return false;/);
  assert.match(src, /to = ownerEmail\(\)/);
  assert.doesNotMatch(src, /body\.(to|recipient|email)/i, "no caller-supplied recipient");
  assert.match(src, /export const GET = liveRoute\(handleGET\);/);
  assert.match(src, /export const POST = liveRoute\(handlePOST\);/);
  assert.match(src, /replace\(\/\[\\r\\n\]\+\/g, " "\)/, "no header injection through the subject");
});

test("the site reports missing settings by NAME and never a value", () => {
  assert.ok(requiredEnvNames().includes(OPERATIONAL_VARS[0]), "the live database variable is required");
  assert.ok(requiredEnvNames().includes("STRIPE_SECRET_KEY"));
  const env = { CRON_SECRET: "super-secret-value", AUTH_SECRET: "another", STRIPE_SECRET_KEY: "sk_live_x" };
  const missing = missingEnv(env);
  assert.ok(missing.includes("RESEND_API_KEY"));
  assert.ok(!missing.includes("CRON_SECRET"));
  assert.ok(!JSON.stringify(missing).includes("super-secret-value"));
  const report = code("src/lib/ops/self-report.ts");
  assert.doesNotMatch(report, /console\.(log|warn|error)/);
});

test("the site's settings check asks only for what the website reads (first live run, 2026-10-14)", () => {
  for (const n of ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "ADMIN_TOKEN"]) assert.ok(!requiredEnvNames().includes(n), `${n} is not a site setting`);
});

test("a send-only Resend key is a working key, a rejected one is not", async () => {
  const real = globalThis.fetch;
  const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
  try {
    globalThis.fetch = reply(401, { statusCode: 401, name: "restricted_api_key", message: "This API key is restricted to only send emails" }) as typeof fetch;
    assert.equal((await siteSelfReport({ RESEND_API_KEY: "re_x" })).resend.valid, true);
    globalThis.fetch = reply(401, { statusCode: 401, name: "validation_error", message: "API key is invalid" }) as typeof fetch;
    assert.equal((await siteSelfReport({ RESEND_API_KEY: "re_x" })).resend.valid, false);
  } finally {
    globalThis.fetch = real;
  }
});

test("the snapshot table is private and additive", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model OpsSnapshot \{\s*key\s+String\s+@id\s+json\s+Json\s+updatedAt\s+DateTime\s+@updatedAt\s*\}/);
  assert.ok(!(PUBLIC_MODELS as readonly string[]).includes("OpsSnapshot"), "operational detail is never exported to data/public");
});

test("the admin pages are admin-only and degrade to 'nothing yet' instead of failing", () => {
  for (const f of ["src/app/admin/health/page.tsx", "src/app/admin/page.tsx"]) {
    const src = code(f);
    assert.match(src, /if \(!\(keyOk \|\| user\?\.isAdmin\)\) notFound\(\);/, f);
    assert.match(src, /robots: \{ index: false, follow: false \}/, f);
  }
  const snap = code("src/lib/ops/snapshot.ts");
  assert.match(snap, /catch \{\s*return null;/);
  const home = code("src/app/admin/page.tsx");
  assert.match(home, /getInboxCounts\(\)\.catch\(\(\) => null\)/);
  assert.match(home, /new in the inbox/);
  assert.match(code("src/app/admin/messages/page.tsx"), /await markInboxSeen\(\)\.catch\(\(\) => \{\}\);/, "opening the inbox is what marks contact messages seen");
});

test("the monitor workflow runs on the live database, every few hours, and digests on Sundays", () => {
  const wf = read(".github/workflows/ops-monitor.yml");
  assert.match(wf, /DATABASE_URL: \$\{\{ secrets\.RM10 \|\| vars\.RM10 \}\}/, "tests/db-chain.test.ts keeps this on the chain head");
  assert.match(wf, /DB_SOURCE_NAME: \$\{\{ \(secrets\.RM10 \|\| vars\.RM10\) && 'RM10' \|\| 'UNSET' \}\}/);
  assert.match(wf, /cron: "17 \*\/3 \* \* \*"/);
  assert.match(wf, /cron: "0 21 \* \* 0"/);
  assert.match(wf, /OPS_DIGEST: \$\{\{ \(github\.event\.schedule == '0 21 \* \* 0' \|\| inputs\.digest\) && '1' \|\| '' \}\}/);
  assert.match(wf, /DRY_RUN: \$\{\{ inputs\.dry_run && '1' \|\| '' \}\}/);
  assert.match(wf, /actions\/cache\/restore@v4[\s\S]*actions\/cache\/save@v4/, "its memory is the Actions cache, not the database it watches");
  assert.match(wf, /permissions:\s*\n\s*contents: read\s*\n\s*actions: read\s*\n\s*deployments: read/, "read-only");
  assert.doesNotMatch(wf, /\[deploy\]/);
});

test("the monitor script marks mail delivered only after it was, and fails the job on an undelivered urgent alert", () => {
  const s = code("scripts/ops-monitor.ts");
  assert.match(s, /if \(outcome === "sent"\) saved = markDelivered\(saved, plan, now\);/);
  assert.match(s, /urgentUndelivered = true;/);
  assert.match(s, /process\.exitCode = 1;/);
  assert.match(s, /outcome === "failed"/);
  assert.doesNotMatch(s, /markDelivered\([^)]*\);\s*\n\s*const outcome/, "never marked before sending");
  // No secret reaches a log line.
  for (const key of ["NEON_API_KEY", "STRIPE_SECRET_KEY", "CRON_SECRET", "RESEND_API_KEY", "EBAY_CLIENT_SECRET"]) {
    assert.doesNotMatch(s, new RegExp(`console\\.[a-z]+\\([^)]*process\\.env\\.${key}`), key);
  }
});

test("no check puts a connection string or key into a result", () => {
  const src = code("src/lib/ops/checks.ts");
  // Credentials appear in request headers (Authorization: Bearer ${key}); they must never appear in the TEXT a
  // person reads, i.e. a summary or an action line.
  const textLines = src.split("\n").filter((l) => /^\s*(summary|action):/.test(l) || /unknown\(d, [^)]*`/.test(l));
  assert.ok(textLines.length > 20, "found the result text lines");
  for (const l of textLines) assert.doesNotMatch(l, /\$\{(url|key|secret|basic|token|cid)\}|databaseUrls|process\.env/, l.trim().slice(0, 100));
});

test("contact messages can be deleted from the inbox, by an admin only", () => {
  const route = code("src/app/api/admin/messages/route.ts");
  assert.match(route, /if \(!\(keyOk \|\| user\?\.isAdmin\)\) \{\s*return NextResponse\.json\(\{ error: "Not authorised" \}, \{ status: 404 \}\);/);
  assert.match(route, /const keyOk = !!token && body\?\.key === token;/);
  assert.match(route, /prisma\.contactMessage\.deleteMany\(\{ where: \{ id \} \}\)/);
  const page = code("src/app/admin/messages/page.tsx");
  assert.match(page, /<MessageActions/);
  assert.match(code("src/components/admin/MessageActions.tsx"), /confirm\("Delete this message permanently\?"\)/);
});
