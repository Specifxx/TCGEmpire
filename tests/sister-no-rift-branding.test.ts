import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildConfirmEmail, senderOf, serviceUrl } from "../src/lib/sister-alerts/email";
import { SISTER_ALERT_SITES } from "../src/lib/sister-alerts/sites";

// Owner, 2026-11-19: the RiftCompare name or logo never appears in another site's sign-up, sign-in or alert flow, and the
// visitor is never sent to another site's address.

test("no sister's mail footer names RiftCompare", () => {
  for (const site of SISTER_ALERT_SITES) {
    assert.equal(senderOf(site), "our shared alert service", site.key);
    const mail = buildConfirmEmail(site.key, "tok", 5000, "US");
    assert.doesNotMatch(mail.html.replace(/https?:\/\/[^"'\s<]+/g, ""), /riftcompare/i, site.key);
    assert.doesNotMatch(mail.subject, /riftcompare/i, site.key);
  }
});

test("the confirm and manage pages carry no RiftCompare footer", () => {
  assert.doesNotMatch(fs.readFileSync("src/lib/sister-alerts/pages.ts", "utf8"), /RiftCompare|run by riftcompare/);
});

test("mail links stay on the service until a site's rewrite is listed", () => {
  const site = { key: "scent", url: "https://scentcompare.app" };
  assert.match(serviceUrl("manage", "t", site), /^https:\/\/[^/]+\/api\/sister-alerts\/manage\?t=t$/);
});

test("the unsubscribe redirect is relative, so a sister's rewrite keeps the visitor on its address", () => {
  const src = fs.readFileSync("src/app/api/sister-alerts/unsubscribe/route.ts", "utf8");
  assert.match(src, /Location: `manage\?t=/);
  assert.doesNotMatch(src, /u\.origin/);
});
