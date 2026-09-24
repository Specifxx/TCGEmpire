import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

// Sign-ups, 2026-09-24 growth pass. DECISIONS.md, "Growth pass: rank for
// 'riftbound card prices' and get more signups".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the five funnel events exist, each fired from where it happens", () => {
  const ev = read("src/lib/growth-events.ts");
  for (const e of ["signup_cta_click", "auth_start", "signup_complete", "alert_created", "newsletter_signup"]) {
    assert.match(ev, new RegExp(`trackEvent\\("${e}"`), e);
  }
  assert.match(read("src/components/AuthForm.tsx"), /trackAuthStart\(provider, placement\)/);
  assert.match(read("src/components/SignupWelcome.tsx"), /trackSignupComplete\(welcome\)/, "first login only: ?welcome= is new-account-only");
  assert.match(read("src/app/api/auth/oauth/[provider]/callback/route.ts"), /if \(isNew\) dest\.searchParams\.set\("welcome", provider\)/);
  assert.match(read("src/lib/use-watchlist.ts"), /trackAlertCreated\(true\)/);
  assert.match(read("src/components/PriceAlertModal.tsx"), /trackAlertCreated\(false\)/);
  assert.match(read("src/components/NewsletterSignup.tsx"), /trackNewsletterSignup\(source\)/);
  // None is an impression, so none is exiled to GA4-only.
  const analytics = read("src/lib/analytics.ts");
  const ga4Only = analytics.slice(analytics.indexOf("GA4_ONLY_EVENTS = new Set(["), analytics.indexOf("]);", analytics.indexOf("GA4_ONLY_EVENTS")));
  for (const e of ["signup_cta_click", "auth_start", "signup_complete", "alert_created", "newsletter_signup"]) assert.ok(!ga4Only.includes(`"${e}"`), e);
});

test("every new placement is an accepted signup source", () => {
  for (const s of ["header", "card_alert", "article_intro", "article_end"]) assert.ok(SIGNUP_SOURCES.has(s), s);
});

test("the header: Log in + Sign up free at every width; the market switcher folds into the menu on phones", () => {
  const nav = read("src/components/Navbar.tsx");
  assert.match(nav, /<CountrySwitcher className="hidden sm:ml-1 sm:block" \/>/);
  assert.match(read("src/components/CinematicNavMenu.tsx"), /<CountrySwitcher className="ml-auto sm:hidden" \/>/, "never unreachable");
});

test("the card page's primary CTA: one-click OAuth that creates the account and the alert together", () => {
  const c = read("src/components/PriceDropAlertCta.tsx");
  assert.match(c, /Get a price-drop alert/);
  assert.match(c, /localStorage\.setItem\(PENDING_WATCH_KEY, JSON\.stringify\(\{ cardId, market: country \}\)\)/, "stashed before the redirect");
  assert.match(c, /\/api\/auth\/oauth\/\$\{provider\}\?next=\$\{encodeURIComponent\(cardPath\)\}/, "returns to the card");
  assert.match(c, /await watch\(cardId, country\)/, "signed in: one click");
  assert.match(c, /price-alert-open/, "email-only stays as the secondary");
  // SignupWelcome completes the stashed watch on return, for new and existing accounts alike.
  assert.match(read("src/components/SignupWelcome.tsx"), /localStorage\.getItem\(PENDING_WATCH_KEY\)/);
  const page = read("src/app/card/[id]/page.tsx");
  const metrics = page.indexOf("<CardPriceMetrics");
  const cta = page.indexOf("<PriceDropAlertCta");
  assert.ok(metrics > 0 && cta > metrics && cta - metrics < 600, "directly under the cheapest price");
});

test("articles: an intro CTA and an end CTA, Radiance-led until release, and the promise is kept", () => {
  const v = read("src/components/ArticleView.tsx");
  assert.match(v, /<ArticleSignupCta placement="article_intro"/);
  assert.match(v, /<ArticleSignupCta placement="article_end"/);
  const c = read("src/components/ArticleSignupCta.tsx");
  assert.match(c, /"Get Radiance spoilers \+ price moves by email"/);
  // The email really carries the spoilers while the heading says so.
  const nl = read("src/lib/newsletter.ts");
  assert.match(nl, /if \(!isBeforeRadianceRelease\(now\)\) return \[\];/);
  assert.match(nl, /\$\{revealsSection\(reveals\)\}/);
  assert.match(read("src/lib/user-digest.ts"), /buildDigest\(movers, r\.market, reveals\)/);
});
