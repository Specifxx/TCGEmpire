import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CMP_GRACE_MS } from "../src/lib/use-consent";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// GA4 consent-timing bug: ConsentDefaults.tsx's wait_for_update used to be
// 500ms while use-consent.ts's CMP_GRACE_MS is 2500ms, so gtag('config', ...)
// fired the first page_view/session_start of nearly every session against the
// still-"denied" default — a cookieless hit GA4 can't attach a channel,
// landing page, or new-user flag to. These guards pin the fix and the two
// things that must NOT change alongside it.

test("wait_for_update in ConsentDefaults.tsx is >= CMP_GRACE_MS in use-consent.ts", () => {
  const src = read("src/components/ConsentDefaults.tsx");
  const matches = [...src.matchAll(/wait_for_update:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(matches.length > 0, "expected at least one wait_for_update in ConsentDefaults.tsx");
  for (const ms of matches) {
    assert.ok(
      ms >= CMP_GRACE_MS,
      `wait_for_update:${ms} must be >= CMP_GRACE_MS (${CMP_GRACE_MS}) or the CMP-absent grant can fire before it`,
    );
  }
});

test("only one gtag consent update reaches dataLayer per page, even though multiple components call useConsent()", () => {
  const src = read("src/lib/use-consent.ts");
  // Module-level, not inside the hook: assignable only once per page load,
  // shared across every mounted useConsent() instance (ConsentGatedAnalytics,
  // GoogleAnalyticsUser, ...).
  assert.match(
    src,
    /^let pushedConsentUpdate = false;/m,
    "expected a module-level `let pushedConsentUpdate = false` guard above the hook function",
  );
  const grantBody = src.slice(src.indexOf("const grant ="), src.indexOf("const attach ="));
  assert.match(
    grantBody,
    /if \(!pushedConsentUpdate\) \{\s*pushedConsentUpdate = true;\s*window\.gtag\?\.\("consent", "update"/,
    "expected the gtag consent-update push gated on the module-level guard",
  );
  // Every instance must still resolve its own local state regardless of the
  // guard, or a second/third mounted consumer would never flip to granted.
  assert.match(
    grantBody,
    /setState\(\{ analytics: true, cmpPresent \}\)/,
    "expected each hook instance to still update its own local state unconditionally",
  );
});

test("the advertising consent signals are untouched — still denied-by-default, never widened by the timing fix", () => {
  const defaults = read("src/components/ConsentDefaults.tsx");
  for (const signal of ["ad_storage", "ad_user_data", "ad_personalization"]) {
    assert.match(defaults, new RegExp(`${signal}:\\s*'denied'`), `${signal} must still default to denied`);
  }
  const consent = read("src/lib/use-consent.ts");
  // The update call must grant ONLY analytics_storage — widening ad consent
  // here would be an advertising-policy change smuggled into a measurement fix.
  assert.match(consent, /\{ analytics_storage: "granted" \}/, "expected an analytics_storage-only grant");
  assert.ok(
    !/ad_storage|ad_user_data|ad_personalization/.test(consent),
    "use-consent.ts must never reference the advertising consent signals",
  );
});

test("GoogleAnalyticsUser's user_id-null behaviour on sign-out is untouched by this fix", () => {
  const src = read("src/components/GoogleAnalyticsUser.tsx");
  assert.match(
    src,
    /const next = consented \? analyticsId : null/,
    "expected the id to still resolve to null when signed out or unconsented",
  );
});
