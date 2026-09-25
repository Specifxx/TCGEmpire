import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Every way into /login says where it came from (2026-09-25).
//
// Until this date ~15 /login links carried no source, and the ones that did
// mark a source on click had it overwritten with "login" by /login's own
// provider button — so funnel-report credited most sign-ups to "login" and no
// surface could be judged. Both failures are silent; this walk keeps them shut.
//
// A /login link passes if it carries ?src= (a whitelisted value), or sits in a
// file whose link marks its source on click (markSignupSource, which /login now
// reads back instead of overwriting), or is on the short allowlist below.
// ─────────────────────────────────────────────────────────────────────────────

// Links that are deliberately source-less:
//  - AuthForm and the /login page are the sign-in step itself (the page's only
//    hit is its own canonical). The profile page's link is a signed-in member
//    linking more providers, and AccountForms' is the expired email-confirmation
//    link's "Sign in"; neither is a sign-up surface.
//  - The Premium links are frozen while the Premium pages are under a change freeze
//    (premium/page.tsx, PremiumPricingCards.tsx) and change with it, not here.
const ALLOWLIST = new Set([
  "src/components/AuthForm.tsx",
  "src/app/login/page.tsx",
  "src/app/profile/page.tsx",
  "src/components/AccountForms.tsx",
  "src/app/premium/page.tsx",
  "src/components/PremiumPricingCards.tsx",
]);

// Files whose /login link marks the source on click instead of in the URL.
const CLICK_MARKED = new Set([
  "src/components/UserMenu.tsx",
  "src/components/AlertsSignupCta.tsx",
  "src/components/ArticleSignupCta.tsx",
  "src/components/PriceAlertModal.tsx",
  "src/components/home/AccountStrip.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(relative(ROOT, p).split("\\").join("/"));
  }
  return out;
}

// A string literal that begins with /login: "/login", "/login?…", `/login?…`.
const LOGIN_LITERAL = /[`"']\/login(?:\?|[`"'])/;

function loginLinks() {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    read(file)
      .split("\n")
      .forEach((text, i) => {
        const t = text.trim();
        if (!LOGIN_LITERAL.test(t)) return;
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
        // Server-side bounces off a gated page (/watching, /portfolio, …) — not
        // a link anyone clicks; a CTA that led there already marked its source.
        if (/\bredirect\(/.test(t)) return;
        // Path lists (UserMenu's AUTH_PATHS, the popups' SKIP_PATHS) name the
        // route, they don't link to it.
        if (/_PATHS\s*=/.test(t)) return;
        hits.push({ file, line: i + 1, text: t });
      });
  }
  return hits;
}

test("every /login link carries a source, marks one on click, or is allowlisted", () => {
  const links = loginLinks();
  assert.ok(links.length >= 20, `the walk should find the site's /login links (found ${links.length})`);
  const bad = links.filter(
    (l) => !/src=/.test(l.text) && !ALLOWLIST.has(l.file) && !CLICK_MARKED.has(l.file),
  );
  assert.deepEqual(
    bad.map((l) => `${l.file}:${l.line}  ${l.text}`),
    [],
    "add &src=<source> (and the source to SIGNUP_SOURCES), or mark it on click",
  );
});

test("every ?src= on a /login link is a whitelisted source, not 'other'", () => {
  for (const l of loginLinks()) {
    for (const m of l.text.matchAll(/[?&]src=([a-z_]+)/g)) {
      assert.ok(SIGNUP_SOURCES.has(m[1]), `${l.file}:${l.line} uses unknown source "${m[1]}"`);
    }
  }
});

test("the click-marked files really do mark their source", () => {
  for (const f of CLICK_MARKED) assert.match(read(f), /markSignupSource\(/, f);
});

test("/login reads the clicked source back instead of overwriting it with 'login'", () => {
  const form = read("src/components/AuthForm.tsx");
  assert.match(form, /source \?\? urlSrc \?\? readSignupSource\(\) \?\? "login"/);
  const lib = read("src/lib/signup-source.ts");
  const body = lib.slice(lib.indexOf("export function readSignupSource"));
  // Whitelisted like every other read; never a raw cookie string.
  assert.match(body, /parseSignupSource\(/);
  assert.match(body, /try \{/);
});

test("the newly tagged surfaces each have their own source", () => {
  for (const s of ["games", "tool_gate", "watchlist_drawer", "quickview", "shared_collection", "feedback"]) {
    assert.ok(SIGNUP_SOURCES.has(s), s);
  }
  // QuickView returns to the card it was opened on, not /profile.
  assert.match(read("src/components/QuickView.tsx"), /\/login\?next=\$\{encodeURIComponent\(cardHref\(card\)\)\}&src=quickview/);
  // The homepage strip returns home rather than to the /profile default.
  assert.match(read("src/components/home/AccountStrip.tsx"), /href="\/login\?next=\/"/);
});

test("/login has a context line for the games and the gated tools", () => {
  const login = read("src/app/login/page.tsx");
  assert.match(login, /path === "\/games" \|\| path\.startsWith\("\/games\/"\) \|\| path === "\/riftle"/);
  for (const p of ["/tools/value-finder", "/tools/demand", "/tools/rising-sealed", "/bulk-pricer", "/tools/best-basket"]) {
    assert.match(login, new RegExp(`"${p.replace(/\//g, "\\/")}":`), p);
  }
});

test("funnel-report prints activation by source from bounded reads", () => {
  const src = read("scripts/funnel-report.ts");
  assert.match(src, /Activation by signup source/);
  assert.match(src, /priceAlert\.groupBy\(\{ by: \["userId"\], where: \{ userId: \{ in: ids \} \}/);
  assert.match(src, /collectionCard\.groupBy\(\{ by: \["userId"\], where: \{ userId: \{ in: ids \} \}/);
});
