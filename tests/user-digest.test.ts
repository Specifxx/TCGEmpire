import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The daily digest to registered accounts (lib/user-digest.ts) was, for an
// unknown stretch, silently failing 100% of the time: Brevo's "Authorised IPs"
// account setting refused every send, the run's own summary counted the
// failures, and nothing surfaced WHY (see DECISIONS.md, 2026-09-10). These pin
// the fix — a `via: "resend"` escape hatch (same shape as
// lib/premium-offer.ts's) and a captured failure REASON, not just a count —
// so a future provider outage can be diagnosed and worked around from the run
// summary alone, and never again has to be root-caused by hand.
// ─────────────────────────────────────────────────────────────────────────────

const LIB = "src/lib/user-digest.ts";
const EMAIL = "src/lib/email.ts";
const ROUTE = "src/app/api/cron/user-digest/route.ts";

test("runUserDigest defaults to Brevo but accepts an explicit via: \"resend\" override", () => {
  const src = read(LIB);
  assert.match(src, /export type UserDigestProvider = "brevo" \| "resend";/);
  assert.match(
    src,
    /const via: UserDigestProvider = opts\?\.via === "resend" \? "resend" : "brevo";/,
    "via must default to brevo unless resend is explicitly requested — never the other way round"
  );
});

test("the configured-provider check follows `via`, not a hardcoded Brevo check", () => {
  const src = read(LIB);
  assert.match(
    src,
    /const configured = via === "resend" \? isEmailEnabled\(\) : isBrevoEnabled\(\);/,
    "must check whichever provider `via` actually selects, or a resend run reports success against an unconfigured Brevo check"
  );
  // And the missing-key case must be reported IN the summary (with a reason),
  // not thrown or silently returned as if nothing was due.
  assert.match(src, /is not set in this environment — nothing would send/);
});

test("every send failure is captured with a REASON, not just counted", () => {
  const src = read(LIB);
  // The opt-out row write and the send itself both route failures through
  // noteError, exactly like lib/premium-offer.ts's runPremiumOfferBlast.
  assert.match(src, /const noteError = \(reason: string\) => \{/);
  assert.match(
    src,
    /noteError\(`opt-out row could not be written: /,
    "a failed opt-out upsert must record why, not just increment `failed`"
  );
  assert.match(
    src,
    /noteError\(getLastEmailError\(\) \?\? "the mail provider returned false with no recorded reason"\);/,
    "a failed send must pull the provider's own error (getLastEmailError) into the summary — this is the exact signal that was missing during the 2026-09-10 Brevo outage"
  );
  assert.match(
    src,
    /if \(errors\.size\) summary\.errors = \[\.\.\.errors\];/,
    "captured reasons must actually reach the returned summary"
  );
});

test("the send call passes `via` through, so a resend run cannot silently fall back to Brevo", () => {
  const src = read(LIB);
  assert.match(
    src,
    /sendUserDigestEmail\(r\.email, digest\.subject, digest\.heading, digest\.inner, unsubUrl, via\)/
  );
});

test("sendUserDigestEmail dispatches on `via`, defaulting to Brevo, same pattern as sendPremiumOfferEmail", () => {
  const src = read(EMAIL);
  const fnAt = src.indexOf("export async function sendUserDigestEmail(");
  assert.ok(fnAt >= 0, "sendUserDigestEmail must still exist");
  const body = src.slice(fnAt, fnAt + 600);
  assert.match(body, /via: "brevo" \| "resend" = "brevo"/, "via must default to brevo");
  assert.match(
    body,
    /return via === "resend" \? sendEmail\(to, subject, html\) : sendEmailBrevo\(to, subject, html\);/,
    "must actually branch on via, not ignore the parameter"
  );
});

test("the idempotent stamp is written only on success, after the send — a resend run never double-sends the same edition", () => {
  const src = read(LIB);
  const sendAt = src.indexOf("await sendUserDigestEmail(");
  const stampAt = src.indexOf("data: { lastEditionKey: edition }");
  assert.ok(sendAt > 0 && stampAt > sendAt, "the edition stamp must be written after the send, inside the success branch");
});

test("the cron route accepts ?via= and ?limit=, and authorizes by header OR ?token=, like the other blast routes", () => {
  const src = read(ROUTE);
  assert.match(
    src,
    /const via: UserDigestProvider = p\.get\("via"\) === "resend" \? "resend" : "brevo";/,
    "the route must expose the provider override as a query param"
  );
  assert.match(src, /runUserDigest\(\{ via, limit \}\)/, "the route must actually pass via/limit through, not just parse them");
  assert.match(
    src,
    /searchParams\.get\("token"\) === secret/,
    "must accept ?token= auth alongside the Bearer header — the pattern every other manually-dispatchable /api/cron/* route uses"
  );
});

test("UserDigestRunSummary reports which provider a run used, so a report can be read without re-deriving it", () => {
  const src = read(LIB);
  const ifaceAt = src.indexOf("export interface UserDigestRunSummary");
  const body = src.slice(ifaceAt, src.indexOf("}", ifaceAt));
  assert.match(body, /via: UserDigestProvider;/);
  assert.match(body, /errors\?: string\[\];/);
});
