import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Price watches, migrated from email-keyed to account-owned.
// ─────────────────────────────────────────────────────────────────────────────
// These are SOURCE-LEVEL assertions (no server, no database) so they can gate a
// PR. They pin the handful of decisions that are invisible at runtime until
// something has already gone wrong: an ownership-forgery hole, a row the drop
// cron can no longer see, or a personal page leaking into the index.

test("PriceAlert.userId is NULLABLE — a required column could not be added by db push", () => {
  const schema = read("prisma/schema.prisma");
  const model = /model PriceAlert \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
  assert.ok(model, "PriceAlert model not found");
  assert.match(model, /userId\s+String\?/, "userId must be optional");
  // email MUST survive: it is still the mail-routing key, still the dedupe key,
  // and the drop cron reads nothing else.
  assert.match(model, /\n\s*email\s+String\n/, "email must remain a required column");
  assert.match(model, /@@unique\(\[email, cardId, market\]\)/, "the email dedupe key must be untouched");
  assert.match(model, /@@index\(\[userId\]\)/, "watchlist reads filter on userId");
});

test("THE FORGERY GUARD: subscribe only claims ownership when the session's own address matches", () => {
  // The email arrives in the REQUEST BODY. Stamping userId from the session
  // without comparing addresses would let any signed-in user POST a stranger's
  // address and adopt that person's watches.
  const src = read("src/app/api/alerts/subscribe/route.ts");
  assert.match(
    src,
    /me\s*&&\s*me\.email\s*===\s*email\s*\?\s*me\.id\s*:\s*null/,
    "userId must be null unless the session address equals the subscribed address",
  );
});

test("the drop-notification cron is untouched — it must never learn accounts exist", () => {
  // Every row still carries an email, so lib/price-alerts.ts keeps serving
  // account-owned and email-only watches identically. If this file starts
  // filtering on userId, anonymous subscribers silently stop being emailed.
  const cron = read("src/lib/price-alerts.ts");
  assert.ok(!/userId/.test(cron), "price-alerts.ts must not reference userId");
});

test("unsubscribe stays token-addressed and session-free", () => {
  // An unsubscribe click arrives from an email client with no cookie. Requiring
  // a session here would break one-click unsubscribe outright.
  const src = read("src/app/api/alerts/unsubscribe/route.ts");
  assert.ok(!/getCurrentUser/.test(src), "unsubscribe must not require a session");
  assert.match(src, /unsubToken/, "unsubscribe is addressed by token");
});

test("every account-scoped watchlist route requires a session", () => {
  for (const p of [
    "src/app/api/alerts/watchlist/route.ts",
    "src/app/api/alerts/watchlist/[cardId]/route.ts",
  ]) {
    const src = read(p);
    assert.match(src, /getCurrentUser\(\)/, `${p}: must read the session`);
    assert.match(src, /status:\s*401/, `${p}: must 401 when signed out`);
    // cookies() ⇒ never cacheable.
    assert.match(src, /export const dynamic = "force-dynamic"/, `${p}: must opt out of caching`);
  }
});

test("unwatch is scoped by userId — that IS the authorisation check", () => {
  // deleteMany({ userId, cardId }) cannot touch another account's row, so there
  // is no 403 branch to get wrong and no way to probe someone else's watches.
  const src = read("src/app/api/alerts/watchlist/[cardId]/route.ts");
  assert.match(src, /deleteMany\(\{[\s\S]*userId:\s*user\.id[\s\S]*\}\)/, "delete must be user-scoped");
});

test("re-watching never resets the price baseline", () => {
  // The baseline is what a drop is measured against. Rewriting it on re-watch
  // would swallow the very drop the watch exists to catch, silently.
  const src = read("src/app/api/alerts/watchlist/route.ts");
  const update = /update:\s*\{([^}]*)\}/.exec(src)?.[1] ?? "";
  assert.ok(update.includes("userId"), "the update branch should claim ownership");
  assert.ok(!update.includes("lastPriceCents"), "the update branch must NOT touch lastPriceCents");
});

test("the watchlist page is noindex and never cached", () => {
  const src = read("src/app/watching/page.tsx");
  assert.match(src, /index:\s*false/, "a personal page must not be indexed");
  assert.match(src, /export const dynamic = "force-dynamic"/, "getCurrentUser reads cookies()");
  // A redirect, not a rendered account wall — a gate rendered as content is what
  // the AdSense audit flags as a paywall.
  assert.match(src, /redirect\("\/login\?next=\/watching"\)/, "signed-out must redirect, not render a wall");
  assert.ok(!/AdSlot/.test(src), "never monetise a noindex personal page");
});

test("the watchlist page exists as a real route and is reachable from the nav", () => {
  assert.ok(existsSync(join(ROOT, "src/app/watching/page.tsx")));
  assert.match(read("src/components/nav-groups.ts"), /href: "\/watching"/);
  assert.match(read("src/components/UserMenu.tsx"), /href="\/watching"/);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE BUG THIS SUITE MISSED THE FIRST TIME.
// ─────────────────────────────────────────────────────────────────────────────
// The page originally shipped at src/app/watchlist/. next.config.js had
// redirected /watchlist -> /alerts since long before, as a keyword alias for the
// price-alerts explainer. Redirects are matched BEFORE routing, so the route
// never rendered once in production — and every assertion above still passed,
// because they all read source files. Only a request to the deployed site
// revealed it.
//
// This is a general trap, not a one-off: any redirect whose source equals a real
// page path silently deletes that page, with no build error and no failing test.
test("NO next.config.js redirect shadows a real app route", () => {
  const cfg = read("next.config.js");
  const app = join(ROOT, "src/app");

  // Static sources only. A source with :params or * is a pattern, and matching
  // those against the route tree properly is a different (much fuzzier) job.
  const sources = [...cfg.matchAll(/source:\s*"(\/[^"]*)"/g)]
    .map((m) => m[1])
    .filter((s) => !s.includes(":") && !s.includes("*"));
  assert.ok(sources.length > 0, "no static redirect sources parsed — has the config shape changed?");

  const shadowed = sources.filter((s) => {
    const seg = s.replace(/^\//, "").replace(/\/$/, "");
    if (!seg) return false;
    return ["page.tsx", "page.ts", "page.jsx", "page.js", "route.ts", "route.js"].some((f) =>
      existsSync(join(app, seg, f)),
    );
  });

  assert.deepEqual(
    shadowed,
    [],
    `these redirect sources match a real route, which can therefore never render: ${shadowed.join(", ")}`,
  );
});

test("/watchlist still redirects to the alerts explainer", () => {
  // Keeping it is the point — it is a permanent (308) redirect, cached by
  // browsers and unrevokable from the server, which is exactly why the personal
  // page moved to /watching instead of trying to reclaim this path.
  assert.match(
    read("next.config.js"),
    /source:\s*"\/watchlist",\s*destination:\s*"\/alerts",\s*permanent:\s*true/,
    "the /watchlist -> /alerts alias must survive",
  );
});

test("the anonymous flow survives — signed-out visitors still get the email path", () => {
  // Gating the bell behind sign-up would cost more conversion than the watchlist
  // gains, so the signed-out branch must still dispatch the modal event.
  const src = read("src/components/PriceWatchButton.tsx");
  assert.match(src, /price-alert-prompt/, "signed-out click must open the email modal");
  // The button is a SIBLING of the tile's <Link>; without these a toggle
  // navigates to the card instead.
  assert.match(src, /e\.preventDefault\(\)/);
  assert.match(src, /e\.stopPropagation\(\)/);
  // Prop signature unchanged, so all five call sites compile untouched.
  assert.match(src, /cardId:\s*string;\s*\n\s*variant\?:/);
});

test("backfill only ever touches unlinked rows, so it is safe to re-run", () => {
  const src = read("scripts/backfill-alert-user-ids.ts");
  assert.match(src, /userId:\s*null/, "must filter to unlinked rows");
  assert.match(src, /DRY_RUN/, "must honour dry-run before writing to production");
});
