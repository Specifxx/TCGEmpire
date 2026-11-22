import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAB1, PAB_BOOT, pabActive, pabArm, pabKey } from "../src/lib/premium-ab";

// Premium team test P1 (ops/premium/tests.md): /premium, Mon 30 Nov to Mon 7 Dec 2026.

test("P1 runs exactly Monday 30 Nov to Monday 7 Dec 2026, 00:00 UTC", () => {
  assert.equal(new Date(PAB1.start).toISOString(), "2026-11-30T00:00:00.000Z");
  assert.equal(new Date(PAB1.end).toISOString(), "2026-12-07T00:00:00.000Z");
  assert.equal(pabActive(PAB1.start - 1), false);
  assert.equal(pabActive(PAB1.start), true);
  assert.equal(pabActive(PAB1.end - 1), true);
  assert.equal(pabActive(PAB1.end), false);
});

test("outside the window nobody has an arm and events carry no pk", () => {
  assert.equal(pabArm(PAB1.start - 1), null);
  assert.equal(pabKey(PAB1.end), undefined);
});

test("the boot script only acts inside the window and marks <html data-pab1>", () => {
  assert.ok(PAB_BOOT.includes(String(PAB1.start)) && PAB_BOOT.includes(String(PAB1.end)));
  assert.ok(PAB_BOOT.includes('setAttribute("data-pab1",v)'));
  assert.ok(PAB_BOOT.includes("try{") && PAB_BOOT.includes("catch(e){}"), "storage failure must not throw");
});

test("the B block is hidden by default and shown only to arm B (no layout shift, no cloaked copy)", () => {
  const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
  assert.ok(css.includes('html[data-pab1="b"] .pab1-b { display: block; }'));
  const proof = readFileSync(join(__dirname, "../src/components/premium/PremiumDealProof.tsx"), "utf8");
  assert.ok(proof.includes('className="pab1-b mt-3 hidden'));
  assert.ok(proof.includes("data-no-cta-track"), "the card link is not a Premium CTA");
});

test("every checkout start carries the arm", () => {
  for (const f of ["PremiumCta.tsx", "GuestCheckoutButton.tsx", "CheckoutLauncher.tsx"]) {
    const src = readFileSync(join(__dirname, "../src/components", f), "utf8");
    assert.ok(/premium_checkout_started[\s\S]{0,400}pk: pabKey\(\)/.test(src), `${f} must send pk`);
  }
});
