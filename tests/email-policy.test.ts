import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendEmail, sendEmailBrevo, MARKETING_EMAIL_OFF, getLastEmailError } from "../src/lib/email";

test("marketing email is refused before any provider is called", async () => {
  assert.equal(MARKETING_EMAIL_OFF, true);
  assert.equal(await sendEmail("a@b.co", "s", "h", { marketing: true }), false);
  assert.match(getLastEmailError() ?? "", /switched off/);
  assert.equal(await sendEmailBrevo("a@b.co", "s", "h", { marketing: true }), false);
});

test("every promotional sender is marked marketing, alerts and account mail are not", () => {
  const src = readFileSync("src/lib/email.ts", "utf8");
  for (const fn of ["sendNewsletterDigestEmail", "sendReleaseDayEmail", "sendUserDigestEmail", "sendCheckoutRecoveryEmail", "sendWelcomeEmail", "sendPremiumOfferEmail", "sendPremiumWinbackEmail", "sendNewsletterWelcomeEmail"]) {
    const at = src.indexOf(`export async function ${fn}(`);
    assert.ok(at >= 0, fn);
    const next = src.indexOf("\nexport ", at + 10);
    assert.match(src.slice(at, next), /marketing: true/, `${fn} must pass marketing: true`);
  }
  for (const fn of ["sendVerificationEmail", "sendSignInLinkEmail", "sendPasswordResetEmail", "sendPriceDropEmail", "sendAlertConfirmationEmail", "sendTrialEndingEmail"]) {
    const at = src.indexOf(`export async function ${fn}(`);
    const next = src.indexOf("\nexport ", at + 10);
    assert.doesNotMatch(src.slice(at, next), /marketing: true/, `${fn} must keep sending`);
  }
});

test("no marketing workflow or Vercel cron is scheduled", () => {
  const vj = readFileSync("vercel.json", "utf8");
  assert.doesNotMatch(vj, /cron\/(newsletter|user-digest)/);
});
