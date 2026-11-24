import { test } from "node:test";
import assert from "node:assert/strict";
import { brandSignOff, emailShell, legacyLine } from "../src/lib/email";

// Rift Google plan item 4 (2026-11-24): every RiftCompare email names the brand and links it home.
test("the email shell's logo links to riftcompare.com with no campaign tags", () => {
  const html = emailShell("Hi", "", "");
  assert.match(html, /<a href="https:\/\/[^"]*riftcompare\.com\/"[^>]*>Rift<span/);
});

test("the sign-off names RiftCompare and links it", () => {
  assert.match(brandSignOff(), /<a href="[^"]*\?utm_source=email&amp;utm_medium=email&amp;utm_campaign=brand-footer"[^>]*>RiftCompare \(riftcompare\.com\)<\/a>/);
});

test("the Legacy line runs through launch day, 13 Dec, then disappears", () => {
  const line = legacyLine(new Date("2026-12-13T23:59:00Z"));
  assert.ok(line);
  assert.match(line.html, /\/legacy-preorders\?utm_source=email/);
  assert.match(line.text, /RiftCompare/);
  assert.equal(legacyLine(new Date("2026-12-14T00:00:00Z")), null);
});
