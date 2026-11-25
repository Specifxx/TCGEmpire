// No ads on Premium, account, sign-in, collection, watches or giveaway pages (lib/ad-free-paths.ts, 2026-11-19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adFreePath } from "../src/lib/ad-free-paths";

test("the utility and conversion pages are ad-free", () => {
  for (const p of ["/premium", "/premium/return", "/account", "/account/verify?t=1", "/collection", "/watching", "/giveaway", "/login"]) assert.equal(adFreePath(p), true, p);
  for (const p of ["/", "/card/x", "/sealed", "/premiums", "/sets/premium-pack", null]) assert.equal(adFreePath(p), false, String(p));
});

test("the layout's ad units sit inside the gate", () => {
  const src = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  for (const unit of ["<PhoneDockAds"]) {
    const at = src.indexOf(unit);
    assert.ok(at > 0, unit);
    assert.ok(src.lastIndexOf("<AdRouteGate>", at) > src.lastIndexOf("</AdRouteGate>", at), `${unit} is gated`);
  }
});
