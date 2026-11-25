import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brandFromSignupSource, brandFromSurface, billedByLine, brandFrom, premiumBrandFor, COMPANY_NAME } from "../src/lib/premium-brand";
import { buildTrialEndingEmail, buildTrialEndingNoChargeEmail } from "../src/lib/email";
import { buildCheckoutSessionParams } from "../src/lib/checkout-params";

// Owner, 2026-11-25: one Premium serves every sister site, but a member who joined on DexCompare, MTG Compare… never
// sees "RiftCompare". lib/premium-brand.ts.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a sister surface or sign-up names that site; anything else is RiftCompare", () => {
  assert.equal(brandFromSurface("sister-dex").name, "DexCompare");
  assert.equal(brandFromSurface("sister-ygo").name, "YGO Compare");
  assert.equal(brandFromSurface("premium_page").name, "RiftCompare");
  assert.equal(brandFromSurface("sister-nope").name, "RiftCompare");
  assert.equal(brandFromSignupSource("sister:mtg:basket").name, "MTG Compare");
  assert.equal(brandFromSignupSource("google").sister, false);
  // The subscription's own surface wins over where the account was made.
  assert.equal(premiumBrandFor({ surface: "sister-tcgprices", signupSource: "sister:dex" }).name, "TCG Prices");
  assert.equal(premiumBrandFor({ surface: null, signupSource: "sister:dex" }).name, "DexCompare");
});

test("a sister's sender, checkout line and fee line never say RiftCompare", () => {
  const dex = brandFromSurface("sister-dex");
  assert.equal(brandFrom(dex, { EMAIL_FROM: "RiftCompare <noreply@riftcompare.com>" }), "DexCompare <noreply@riftcompare.com>");
  assert.equal(brandFrom(brandFromSurface(null), {}), undefined, "RiftCompare keeps its default sender");
  assert.match(billedByLine(dex), new RegExp(`DexCompare Premium is billed by ${COMPANY_NAME}`));
  const params = buildCheckoutSessionParams({
    userId: "u1",
    email: "a@b.co",
    stripeCustomerId: null,
    tier: "premium",
    plan: "monthly",
    priceId: "price_x",
    currency: "usd",
    trial: { days: 14, feeCents: 100 },
    coupon: null,
    surface: "sister-dex",
    brand: { name: dex.name, sister: true, billedBy: billedByLine(dex) },
  });
  const json = JSON.stringify(params);
  assert.doesNotMatch(json, /RiftCompare/);
  assert.match(json, /DexCompare Premium — first 14 days/);
  const submit = params.custom_text?.submit as { message?: string } | undefined;
  assert.match(String(submit?.message), /^DexCompare Premium is billed by Compare Empire/);
});

test("the trial-ending notices are in the site's name, colour and links", () => {
  const dex = brandFromSurface("sister-dex");
  const brand = { name: dex.name, url: dex.url, sister: true, color: dex.color };
  const a = buildTrialEndingEmail({ chargeDate: new Date("2026-12-01"), amountLabel: "$4.99/month", brand });
  const b = buildTrialEndingNoChargeEmail({ endsAt: new Date("2026-12-01"), brand });
  for (const e of [a, b]) {
    assert.doesNotMatch(e.subject + e.html, /RiftCompare|riftcompare\.com\/premium|Riftbound/);
    assert.match(e.subject, /DexCompare/);
    assert.match(e.html, /https:\/\/dexcompare\.io\/premium/);
  }
  // RiftCompare's own members are unchanged.
  assert.match(buildTrialEndingEmail({ chargeDate: new Date("2026-12-01"), amountLabel: "$4.99/month" }).subject, /RiftCompare/);
});

test("RiftCompare's welcome, Premium-offer and win-back mail skip accounts a sister made", () => {
  for (const f of ["src/lib/welcome-email.ts", "src/lib/premium-offer.ts", "src/lib/premium-winback.ts"]) {
    assert.match(read(f), /RIFT_SIGNUP_WHERE/, f);
  }
  const offer = read("src/lib/premium-offer.ts");
  assert.equal((offer.match(/RIFT_SIGNUP_WHERE\]/g) ?? []).length + (offer.match(/RIFT_SIGNUP_WHERE, \{ isAdmin/g) ?? []).length, 2, "the send and the admin list read the same audience");
});
