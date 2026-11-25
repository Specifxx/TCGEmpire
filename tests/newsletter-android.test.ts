import test from "node:test";
import assert from "node:assert/strict";
import { androidSection, ANDROID_FEATURE_UNTIL } from "../src/lib/newsletter";

// The Android tester call rides the weekly email for two editions (2026-11-26), never as its own email.
test("the Android tester block shows until its end date, then disappears", () => {
  const before = androidSection(new Date("2026-11-27T20:30:00Z"));
  assert.match(before, /riftcompare\.com\/android\?utm_source=riftcompare&amp;utm_medium=email&amp;utm_campaign=android-beta/);
  assert.match(before, /12 people/);
  assert.equal(androidSection(ANDROID_FEATURE_UNTIL), "");
  assert.equal(androidSection(new Date("2027-01-01T00:00:00Z")), "");
});
