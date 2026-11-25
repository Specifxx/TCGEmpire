import test from "node:test";
import assert from "node:assert/strict";
import { extensionSection, EXTENSION_FEATURE_UNTIL } from "../src/lib/newsletter";

// The Chrome extension block rides the weekly digest and newsletter for two editions only (2026-11-23), never as its
// own email, and links the Web Store listing with the email's tags.
test("the extension block shows until its end date, then disappears", () => {
  const before = extensionSection(new Date("2026-11-27T00:00:00Z"));
  assert.match(before, /chromewebstore\.google\.com\/detail\/fdhpgledimoadpaokiipficepklogmha\?utm_source=riftcompare&amp;utm_medium=email&amp;utm_campaign=extension-launch/);
  assert.match(before, /tracks nothing/);
  assert.equal(extensionSection(EXTENSION_FEATURE_UNTIL), "");
  assert.equal(extensionSection(new Date("2027-01-01T00:00:00Z")), "");
});
