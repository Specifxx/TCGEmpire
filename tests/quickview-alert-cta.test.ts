import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

// The one-click price-drop alert inside QuickView, 2026-09-25. DECISIONS.md,
// "QuickView gets the one-click price-drop alert".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("QuickView renders the compact alert with its own placement, below the eBay tabs", () => {
  const qv = read("src/components/QuickView.tsx");
  assert.match(qv, /import \{ PriceDropAlertCta \} from "\.\/PriceDropAlertCta"/);
  // `unpriced` / `preorder` (2026-09-26, tests/reddit-landing-conversion.test.ts):
  // a card with no price is offered the notice that will actually fire.
  assert.match(
    qv,
    /<PriceDropAlertCta\s+compact\s+placement="quickview_alert"\s+cardId=\{card\.id\}\s+cardPath=\{href\}\s+providers=\{providers\}\s+unpriced=\{[^}]+\}\s+preorder=\{isPreorderSetCode\(card\.setCode\)\}\s+pending=\{prices === null\}\s*\/>/,
  );
  const disclosure = qv.indexOf('<AffiliateDisclosure partner="ebay" tight />');
  const cta = qv.indexOf("<PriceDropAlertCta");
  const collection = qv.indexOf("＋ Add to collection");
  assert.ok(disclosure > 0 && cta > disclosure && collection > cta, "after the eBay buy path, above the collection row");
  // The heart stays: signed-in visitors still get the icon toggle.
  assert.match(qv, /<PriceWatchButton cardId=\{card\.id\} variant="responsive" \/>/);
  assert.match(qv, /onClose=\{close\} providers=\{providers\}/, "threaded from the provider to the modal");
});

test("the root layout hands QuickView the env-only provider list", () => {
  assert.match(read("src/app/layout.tsx"), /<QuickViewProvider providers=\{enabledProviders\(\)\}>/);
});

test("quickview_alert is a whitelisted signup source, and the placement reaches all three calls", () => {
  assert.ok(SIGNUP_SOURCES.has("quickview_alert"));
  assert.ok(SIGNUP_SOURCES.has("card_alert"), "the card page's source stays");
  const c = read("src/components/PriceDropAlertCta.tsx");
  assert.match(c, /placement = "card_alert"/, "the card page's call site is unchanged");
  assert.match(c, /markSignupSource\(placement\)/);
  assert.match(c, /trackSignupCta\(placement\)/);
  assert.match(c, /trackAuthStart\(provider, placement\)/);
  assert.doesNotMatch(c, /markSignupSource\("card_alert"\)/, "no hardcoded placement left");
});

test("compact mode uses no btn-primary: the retailer buy buttons stay QuickView's only filled CTA", () => {
  const c = read("src/components/PriceDropAlertCta.tsx");
  const start = c.indexOf("if (compact) {");
  const end = c.indexOf("if (user) {", start);
  assert.ok(start > 0 && end > start);
  const compact = c.slice(start, end);
  assert.doesNotMatch(compact, /btn-primary/);
  // The label and toggle read from `copy` (2026-09-26), which still words a
  // PRICED card exactly as before — only an unpriced one says in-stock/pre-order.
  assert.match(compact, /\{copy\.label\}:/);
  assert.match(compact, /\{watching \? copy\.on : copy\.email\}/);
  assert.match(c, /!unpriced\s*\?\s*\{ label: "Price-drop alert", get: "Get a price-drop alert", on: "✓ Price-drop alert on", email: "Email me when it drops" \}/);
  assert.match(compact, /Continue with Google/);
  assert.match(compact, /onClick=\{enable\}/, "signed in: one click");
  assert.match(compact, /or email me/);
});
