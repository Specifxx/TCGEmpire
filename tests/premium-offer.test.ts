import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { brevoPayload, buildPremiumOfferEmail, premiumOfferSubject, priceDropLinks, PRICE_DROP_CAMPAIGN, PRICE_DROP_SRC, type PremiumOfferEmailOpts } from "../src/lib/email";
import {
  DEFAULT_BATCH,
  announcementUnsubUrls,
  priceDropAudience,
  runPremiumOfferBlast,
  type PriceDropDeps,
  type PriceDropUserRow,
} from "../src/lib/premium-offer";
import {
  PLUS_ANNUAL_AMOUNT,
  PLUS_PRICE_AMOUNT,
  PREMIUM_ANNUAL_AMOUNT,
  PREMIUM_PRICE_AMOUNT,
  annualSavingPct,
  premiumEffectiveMonthly,
} from "../src/lib/site";
import { isPremiumClickSource, isPremiumSurface } from "../src/lib/premium-surface";
import { parseStartSrc } from "../src/lib/premium-start";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The one-off PRICE-DROP announcement (2026-09-27) — the "month on us" offer's
// machinery, repurposed. See lib/premium-offer.ts. DB-free: the audience is a
// pure function and the run takes injectable deps, so the real loop (dry run,
// stamping, resumability) is exercised here with fakes.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const future = () => new Date(Date.now() + 30 * DAY);
const past = () => new Date(Date.now() - 30 * DAY);

function user(id: string, over: Partial<PriceDropUserRow> = {}): PriceDropUserRow {
  return {
    id,
    email: `${id}@example.com`,
    displayName: id,
    isAdmin: false,
    premiumUntil: null,
    premiumTier: null,
    premiumTierFloor: null,
    priceDropEmailSentAt: null,
    ...over,
  };
}

const ROWS: PriceDropUserRow[] = [
  user("never-paid"),
  user("lapsed", { premiumUntil: past(), premiumTier: "premium" }),
  user("cancelled-trialist", { premiumUntil: past(), premiumTier: "plus" }),
  user("paying-plus", { premiumUntil: future(), premiumTier: "plus" }),
  user("paying-premium", { premiumUntil: future(), premiumTier: "premium" }),
  user("floor-premium", { premiumUntil: future(), premiumTier: "plus", premiumTierFloor: "premium" }),
  user("admin", { isAdmin: true }),
  user("seed", { email: "persona@tcgempire.au" }),
  user("seed2", { email: "test@test.com" }),
  user("opted-out"),
  user("stamped", { priceDropEmailSentAt: new Date() }),
  // The OLD campaign's stamp is a different column and never read: an account
  // the "month on us" offer reached is still in this audience.
  user("got-old-offer"),
  user("dupe", { email: "Never-Paid@Example.com " }),
];
const OPTED_OUT = new Set(["opted-out@example.com"]);

test("the audience: not paying, not admin, not seed, not opted out; lapsed and never-paid included", () => {
  const a = priceDropAudience(ROWS, OPTED_OUT);
  const ids = a.audience.map((r) => r.id).sort();
  assert.deepEqual(ids, ["cancelled-trialist", "got-old-offer", "lapsed", "never-paid", "stamped"]);
  assert.equal(a.paying, 3, "active Plus, active Premium and a floor-raised account are paying");
  assert.equal(a.admins, 1);
  assert.equal(a.seeds, 2);
  assert.equal(a.suppressed, 1);
  assert.deepEqual(a.pending.map((r) => r.id).sort(), ["cancelled-trialist", "got-old-offer", "lapsed", "never-paid"], "the stamped account is not pending");
  assert.ok(!a.audience.some((r) => r.id === "dupe"), "deduped by lowercased, trimmed email");
});

test("a hand-picked selection narrows but never widens, and re-send needs a named selection", () => {
  const picked = priceDropAudience(ROWS, OPTED_OUT, { only: new Set(["paying-plus", "admin", "opted-out", "never-paid", "stamped"]) });
  assert.deepEqual(picked.pending.map((r) => r.id), ["never-paid"]);
  const resendNamed = priceDropAudience(ROWS, OPTED_OUT, { only: new Set(["stamped"]), resend: true });
  assert.deepEqual(resendNamed.pending.map((r) => r.id), ["stamped"]);
  const resendAll = priceDropAudience(ROWS, OPTED_OUT, { resend: true });
  assert.ok(!resendAll.pending.some((r) => r.id === "stamped"), "resend without userIds is inert — never a second blast to everyone");
});

function fakeDeps(rows: PriceDropUserRow[], optedOut = OPTED_OUT) {
  const sent: { to: string; opts: PremiumOfferEmailOpts }[] = [];
  const stamped: string[] = [];
  const tokens: string[] = [];
  let failFor: string | null = null;
  const deps: PriceDropDeps = {
    loadUsers: async () => rows.map((r) => ({ ...r, priceDropEmailSentAt: stamped.includes(r.id) ? new Date() : r.priceDropEmailSentAt })),
    loadOptedOut: async () => optedOut,
    optOutToken: async (email) => {
      tokens.push(email);
      return `tok-${email}`;
    },
    send: async (to, opts) => {
      if (to === failFor) return false;
      sent.push({ to, opts });
      return true;
    },
    stamp: async (id) => {
      stamped.push(id);
    },
    providerConfigured: () => true,
    lastError: () => "Brevo 500: boom",
    sleep: async () => {},
  };
  return { deps, sent, stamped, tokens, failOn: (to: string) => (failFor = to) };
}

test("a dry run sends nothing, mints nothing, stamps nothing — and reports the reach", async () => {
  const f = fakeDeps(ROWS);
  const r = await runPremiumOfferBlast({ dryRun: true }, f.deps);
  assert.equal(r.ok, true);
  assert.equal(r.sent, 0);
  assert.equal(f.sent.length, 0);
  assert.equal(f.stamped.length, 0);
  assert.equal(f.tokens.length, 0, "no opt-out row is written on a dry run");
  assert.equal(r.audienceSize, 5);
  assert.equal(r.alreadySent, 1);
  assert.equal(r.pending, 4);
  assert.equal(r.remaining, 4);
  assert.equal(r.suppressed, 1);
  assert.equal(r.paying, 3);
});

test("a live run is idempotent and resumable: stamped on success only, a re-run sends only what is left", async () => {
  const f = fakeDeps(ROWS);
  f.failOn("lapsed@example.com");
  const first = await runPremiumOfferBlast({ dryRun: false, limit: 3 }, f.deps);
  assert.equal(first.sent, 2);
  assert.equal(first.failed, 1);
  assert.deepEqual(first.errors, ["Brevo 500: boom"], "a failure says why");
  assert.equal(f.stamped.length, 2, "the failed send is not stamped, so it is retried");
  assert.ok(!f.stamped.includes("lapsed"));
  assert.equal(first.remaining, 2);
  // Each email carries its own opt-out links, minted before the send.
  for (const s of f.sent) {
    assert.equal(s.opts.unsubUrl, announcementUnsubUrls(`tok-${s.to}`).unsubUrl);
    assert.match(s.opts.oneClickUrl ?? "", /\/api\/announcements\/unsubscribe\?token=/);
  }

  f.failOn("nobody");
  const second = await runPremiumOfferBlast({ dryRun: false }, f.deps);
  assert.equal(second.pending, 2);
  assert.equal(second.sent, 2);
  assert.equal(second.remaining, 0);
  const third = await runPremiumOfferBlast({ dryRun: false }, f.deps);
  assert.equal(third.sent, 0, "nothing is ever sent twice");
  assert.equal(new Set(f.sent.map((s) => s.to)).size, f.sent.length);
  assert.ok(!f.sent.some((s) => /paying|admin|tcgempire|test@test|opted-out/.test(s.to)));
});

test("a live run refuses without a configured provider, and the default batch stays under Brevo's daily cap", async () => {
  const f = fakeDeps(ROWS);
  const r = await runPremiumOfferBlast({ dryRun: false }, { ...f.deps, providerConfigured: () => false });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /BREVO_API_KEY/);
  assert.equal(f.sent.length, 0);
  assert.ok(DEFAULT_BATCH > 0 && DEFAULT_BATCH <= 300);
  const many = Array.from({ length: DEFAULT_BATCH + 10 }, (_, i) => user(`u${i}`));
  const g = fakeDeps(many, new Set());
  const run = await runPremiumOfferBlast({ dryRun: false }, g.deps);
  assert.equal(run.sent, DEFAULT_BATCH);
  assert.equal(run.remaining, 10);
});

// ── The email ────────────────────────────────────────────────────────────────

const email = buildPremiumOfferEmail({
  displayName: "Bill Yang",
  unsubUrl: "https://riftcompare.com/announcements/unsubscribe?token=abc",
  oneClickUrl: "https://riftcompare.com/api/announcements/unsubscribe?token=abc",
});

test("the prices are the site's own constants (2026-09-26: $3.33 and $2.00 billed yearly)", () => {
  assert.equal(premiumEffectiveMonthly("premium"), "$3.33");
  assert.equal(premiumEffectiveMonthly("plus"), "$2.00");
  assert.equal(annualSavingPct("premium"), 33);
  assert.equal(annualSavingPct("plus"), 33);
  assert.equal(premiumOfferSubject(), `RiftCompare Premium is now ${PREMIUM_PRICE_AMOUNT} a month`);
  assert.equal(email.subject, premiumOfferSubject());
  for (const body of [email.html, email.text]) {
    for (const amount of [PREMIUM_PRICE_AMOUNT, PREMIUM_ANNUAL_AMOUNT, PLUS_PRICE_AMOUNT, PLUS_ANNUAL_AMOUNT]) {
      assert.ok(body.includes(amount), `must state ${amount}`);
    }
    assert.ok(body.includes(`${premiumEffectiveMonthly("premium")}/mo billed yearly (${PREMIUM_ANNUAL_AMOUNT} a year)`));
    assert.ok(body.includes(`${premiumEffectiveMonthly("plus")}/mo billed yearly (${PLUS_ANNUAL_AMOUNT} a year)`));
  }
  // lib/email.ts types no price: every figure is interpolated.
  const src = read("src/lib/email.ts");
  const region = src.slice(src.indexOf("One-off price-drop announcement"), src.indexOf("export async function sendPremiumOfferEmail"));
  assert.doesNotMatch(region.replace(/^\s*\/\/.*$/gm, ""), /\$\d/, "no typed dollar amount in the template");
});

test("a yearly plan's per-month figure never appears without 'billed yearly'", () => {
  for (const body of [email.html, email.text]) {
    for (const eff of [premiumEffectiveMonthly("premium"), premiumEffectiveMonthly("plus"), "$1.99"]) {
      let at = body.indexOf(eff);
      while (at >= 0) {
        assert.equal(body.slice(at, at + eff.length + "/mo billed yearly".length), `${eff}/mo billed yearly`, `${eff} must be followed by "/mo billed yearly"`);
        at = body.indexOf(eff, at + 1);
      }
    }
    assert.ok(!body.includes("$1.99"), "Plus yearly stayed $23.99, so $1.99 is never quoted");
  }
  assert.ok(!email.subject.includes(premiumEffectiveMonthly("premium")), "the subject quotes the monthly price, never a bare per-month-of-a-year figure");
});

test("four subscribe links through /premium/start with tier, plan, src and the campaign, plus a compare link", () => {
  const links = priceDropLinks();
  const expect = [
    [links.plusAnnual, "plus", "annual"],
    [links.plusMonthly, "plus", "monthly"],
    [links.premiumAnnual, "premium", "annual"],
    [links.premiumMonthly, "premium", "monthly"],
  ] as const;
  for (const [url, tier, plan] of expect) {
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, "https://riftcompare.com/premium/start");
    assert.equal(u.searchParams.get("tier"), tier);
    assert.equal(u.searchParams.get("plan"), plan);
    assert.equal(u.searchParams.get("src"), "price-drop-email");
    assert.equal(u.searchParams.get("utm_campaign"), "price-drop-2026-09");
    assert.equal(u.searchParams.get("utm_source"), "email");
    assert.ok(email.html.includes(url), `the html carries ${tier} ${plan}`);
    assert.ok(email.text.includes(url), `the text part carries ${tier} ${plan}`);
  }
  const compare = new URL(links.compare);
  assert.equal(compare.pathname, "/premium");
  assert.equal(compare.searchParams.get("src"), "price-drop-email");
  assert.ok(email.html.includes(links.compare));
  assert.equal(PRICE_DROP_SRC, "price-drop-email");
  assert.equal(PRICE_DROP_CAMPAIGN, "price-drop-2026-09");
});

test("the attribution source is valid end to end: click allow-list, start step, launcher, /premium beacon", () => {
  assert.ok(isPremiumClickSource("price-drop-email"));
  assert.ok(isPremiumSurface("price-drop-email"), "a surface, so checkout stamps it on PremiumClick.surface and Stripe metadata");
  assert.equal(parseStartSrc("price-drop-email"), "price-drop-email", "/premium/start keeps the src through the sign-in round trip");
  const launcher = read("src/components/CheckoutLauncher.tsx");
  assert.match(launcher, /if \(isPremiumSurface\(src\)\) firePremiumClickBeacon\(src\);\s*void launch\(\);/, "the click is recorded (signed in) before checkout reads the remembered surface");
  const beacon = read("src/components/PremiumRecoveryBeacon.tsx");
  assert.match(beacon, /src === "price-drop-email"\) firePremiumClickBeacon\("price-drop-email"\)/);
  assert.match(beacon, /firePremiumClickBeacon\("offer"\)/, "links in the old offer email keep working");
  // Signed out, /premium/start's sign-in form returns to the same URL, src included.
  const start = read("src/app/premium/start/page.tsx");
  assert.match(start, /const selfQuery = new URLSearchParams\(\{ tier, plan, src \}\);/);
});

test("each tier's one-line summary matches the current lineup", () => {
  for (const body of [email.html, email.text]) {
    assert.match(body, /No ads on any page/);
    assert.ok(body.includes(`target-price alerts on up to ${PLUS_TARGET_ALERT_LIMIT} cards`));
    assert.match(body, /only my cards/);
    assert.match(body, /full Rising Cards list/);
    assert.match(body, /Everything in Plus, plus unlimited target-price alerts/);
    assert.match(body, /Best Basket's store-by-store plan and Buy this list/);
    assert.match(body, /Demand Finder/);
    assert.match(body, /cancel anytime/i);
  }
});

test("honest: no deadline, no countdown, no scarcity, no trial promise", () => {
  for (const body of [email.html, email.text]) {
    assert.doesNotMatch(body, /only \d+ (spots|left|places)|hours left|countdown|hurry|last chance|ends (on|soon)|before \d/i);
    assert.doesNotMatch(body, /free trial|\$0 today/i);
  }
});

test("opt-out: footer link, plain-text link, and one-click List-Unsubscribe headers", () => {
  assert.match(email.html, /announcements\/unsubscribe\?token=abc/);
  assert.match(email.html, /Don't email me announcements/);
  assert.match(email.text, /Don't email me announcements: https:\/\/riftcompare\.com\/announcements\/unsubscribe\?token=abc/);
  assert.equal(email.headers["List-Unsubscribe"], "<https://riftcompare.com/api/announcements/unsubscribe?token=abc>");
  assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const route = read("src/app/api/announcements/unsubscribe/route.ts");
  assert.match(route, /const fromQuery = new URL\(req\.url\)\.searchParams\.get\("token"\)/, "the one-click POST carries its token in the URL");
  // Brevo gets the text part and the headers too.
  const payload = brevoPayload(
    { sender: { name: "R", email: "r@x" }, to: [{ email: "a@b" }], subject: "s", htmlContent: "h" },
    { text: email.text, headers: email.headers },
  );
  assert.equal(payload.textContent, email.text);
  assert.deepEqual(payload.headers, email.headers);
  assert.deepEqual(Object.keys(brevoPayload({ sender: { name: "R", email: "r@x" }, to: [{ email: "a@b" }], subject: "s", htmlContent: "h" })).sort(), ["htmlContent", "sender", "subject", "to"], "callers passing no extras send exactly what they did");
  assert.match(read("src/lib/email.ts"), /sendEmailBrevo\(to, subject, html, \{ text, headers \}\)/);
});

test("an email-shaped display name falls back to a plain greeting, and names are HTML-escaped", () => {
  const emailish = buildPremiumOfferEmail({ displayName: "bill@example.com", unsubUrl: "u" }).html;
  assert.match(emailish, /Hi there,/);
  const hostile = buildPremiumOfferEmail({ displayName: "<img src=x onerror=alert(1)>", unsubUrl: "u" }).html;
  assert.doesNotMatch(hostile, /<img src=x/);
  assert.match(hostile, /&lt;img/);
  assert.match(email.html, /Hi Bill,/);
});

// ── Routes, workflow, console ────────────────────────────────────────────────

test("User.priceDropEmailSentAt is a NEW additive column; the old offer's stamp is left alone and unread", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /priceDropEmailSentAt\s+DateTime\?/);
  assert.match(schema, /premiumOfferSentAt\s+DateTime\?/, "the old column stays");
  const lib = read("src/lib/premium-offer.ts").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(lib, /premiumOfferSentAt/, "accounts the old offer reached must still get this one");
  assert.match(lib, /data: \{ priceDropEmailSentAt: new Date\(\) \}/);
  assert.match(lib, /isPremium\(u\)/, "paying is the site's own entitlement check, floor included");
  assert.doesNotMatch(lib, /data: \{[^}]*premiumUntil/, "never grants anything");
  assert.doesNotMatch(lib, /from "\.\/stripe"|stripe\(\)/, "never touches Stripe");
});

test("the cron route fails CLOSED, defaults to a dry run, needs no deadline and caps the batch", () => {
  const src = read("src/app/api/cron/premium-offer/route.ts");
  assert.match(src, /if \(!secret\) return false;/);
  assert.match(src, /const dryRun = p\.get\("dry"\) !== "0";/);
  assert.doesNotMatch(src, /p\.get\("until"\)/);
  assert.match(src, /Math\.min\(limitRaw, 300\)/);
});

test("the workflow is dispatch-only, defaults dry_run to true, has no deadline input, and fails loudly without CRON_SECRET", () => {
  const src = read(".github/workflows/premium-offer-email.yml");
  assert.doesNotMatch(src, /^\s*schedule:/m);
  assert.match(src, /dry_run:[\s\S]*?default: true/);
  assert.doesNotMatch(src, /offer_ends|until=/);
  assert.match(src, /::error::No CRON_SECRET secret set/);
  assert.match(src, /api\/cron\/premium-offer\?dry=\$DRY&via=\$VIA/);
  assert.match(src, /concurrency:[\s\S]*?group: premium-offer-email/);
  assert.match(src, /^name: Price-drop email$/m);
});

test("the admin route: dual gate, three actions, only `send` delivers, a hand-typed limit stays under a day's cap", () => {
  const src = read("src/app/api/admin/premium-offer/route.ts");
  assert.match(src, /const keyOk = !!token && body\?\.key === token;/);
  assert.match(src, /if \(!\(keyOk \|\| me\?\.isAdmin\)\)/);
  assert.match(src, /status: 404/);
  assert.match(src, /dryRun: action === "preview"/);
  assert.match(src, /action must be preview, send or test/);
  assert.match(src, /Math\.min\(limitRaw, 300\)/);
  assert.doesNotMatch(src, /offerEnds/);
});

test("the admin page shows the reach before sending and is gated like the other admin pages", () => {
  const page = read("src/app/admin/premium-offer/page.tsx");
  assert.match(page, /if \(!\(keyOk \|\| me\?\.isAdmin\)\) notFound\(\);/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /runPremiumOfferBlast\(\{ dryRun: true \}\)/, "the counts come from a dry run over every account");
  for (const label of ["Audience", "Already sent", "Remaining", "Opted out"]) assert.ok(page.includes(`"${label}"`), `shows ${label}`);
  const console_ = read("src/components/admin/PremiumOfferConsole.tsx");
  assert.match(console_, /window\.confirm\(/);
  assert.match(console_, /action: "send", userIds: ids, resend/);
  assert.match(console_, /action: "test"/);
  assert.doesNotMatch(console_, /offerEnds|grant-premium/);
  assert.match(read("src/app/admin/page.tsx"), /href: "\/admin\/premium-offer"/);
});

test("the test send stamps nothing and mints no opt-out row", () => {
  const src = read("src/lib/premium-offer.ts");
  const at = src.indexOf("export async function sendPremiumOfferTest");
  const body = src.slice(at, at + 1200);
  assert.doesNotMatch(body, /prisma\./);
  assert.doesNotMatch(body, /stamp|optOutToken/);
});
