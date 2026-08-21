import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tickQuota, utcDayKey } from "../src/lib/search-quota";
import { ANON_SEARCH_LIMIT, FREE_SEARCH_LIMIT, SEARCH_BURST_MS } from "../src/lib/search-limits";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => existsSync(join(ROOT, p));

// ─────────────────────────────────────────────────────────────────────────────
// The daily search-tier ladder: 10/day signed out, 100/day free account,
// unlimited Premium. The first CONCRETE, felt difference between the three
// tiers (everything else the tier model gates is a whole separate page/tool —
// this is the one thing a visitor runs into mid-task), which is why it's what
// the signup popup and the navbar/search-gate CTAs are built to sell.
// ─────────────────────────────────────────────────────────────────────────────

test("the tier ladder is 10 anonymous / 100 free / unlimited Premium", () => {
  assert.equal(ANON_SEARCH_LIMIT, 10);
  assert.equal(FREE_SEARCH_LIMIT, 100);
  assert.ok(FREE_SEARCH_LIMIT > ANON_SEARCH_LIMIT, "the free-account bump must be a real upgrade");
});

// ── tickQuota (real unit tests — the one piece of actual logic here) ────────

test("tickQuota starts a fresh visitor at 0 and counts their first search", () => {
  const r = tickQuota(undefined, 10, 1_000_000);
  assert.equal(r.blocked, false);
  assert.equal(r.remaining, 9);
});

test("tickQuota blocks at the limit without touching the count further", () => {
  const day = utcDayKey(1_000_000);
  const atLimit = `${day}.10.500`;
  const r = tickQuota(atLimit, 10, 1_000_000);
  assert.equal(r.blocked, true);
  assert.equal(r.remaining, 0);
  // The count in the written-back cookie must stay at the limit, not increment
  // past it — an over-limit counter must never itself become evidence of an
  // even-higher limit if the constant is ever lowered later.
  assert.match(r.cookieValue, new RegExp(`^${day}\\.10\\.`));
});

test("tickQuota collapses a fast burst of keystrokes into ONE search", () => {
  // The typeahead fires a debounced request per settled keystroke — without
  // burst-collapsing, typing one query would burn several searches from a
  // 10/day budget before the visitor even finished typing it.
  const day = utcDayKey(1_000_000);
  const first = tickQuota(undefined, 10, 1_000_000);
  assert.equal(first.remaining, 9);
  const withinBurst = tickQuota(`${day}.1.1000000`, 10, 1_000_000 + SEARCH_BURST_MS - 1);
  assert.equal(withinBurst.remaining, 9, "a request inside the burst window must not advance the count");
  const afterBurst = tickQuota(`${day}.1.1000000`, 10, 1_000_000 + SEARCH_BURST_MS + 1);
  assert.equal(afterBurst.remaining, 8, "a request past the burst window must start a new search");
});

test("tickQuota resets on a UTC day rollover", () => {
  // A cookie carrying yesterday's exhausted count must not survive into a new
  // day — the parts[0] === day check in tickQuota is what resets it. The
  // rollover timestamp is well past SEARCH_BURST_MS from the default lastMs=0
  // so the reset itself reads as a fresh, countable search, not a burst.
  const stale = `${utcDayKey(0)}.10.500`;
  const today = tickQuota(stale, 10, 86_400_000 + SEARCH_BURST_MS + 1);
  assert.equal(today.blocked, false, "yesterday's exhausted count must not carry over");
  assert.equal(today.remaining, 9);
});

// ── /api/search enforcement ──────────────────────────────────────────────────

const SEARCH_ROUTE = "src/app/api/search/route.ts";

test("the search route gates on isPremium, not hasAccount — Premium is truly unlimited", () => {
  const src = read(SEARCH_ROUTE);
  assert.match(src, /if \(!isPremium\(user\)\)/, "quota must be skipped entirely for Premium");
});

test("a blocked search does no database work — the gate short-circuits before Prisma", () => {
  const src = read(SEARCH_ROUTE);
  const blockIdx = src.indexOf("if (quota.blocked)");
  const dbIdx = src.indexOf("prisma.card.findMany");
  assert.ok(blockIdx > 0 && dbIdx > blockIdx, "the blocked-request return must come before the DB query in source order");
  const blockedReturn = src.slice(blockIdx, src.indexOf("return res;", blockIdx));
  assert.ok(!/prisma\./.test(blockedReturn), "the blocked branch must not touch prisma");
});

test("the free-vs-anon limit is chosen by session, not by the request", () => {
  const src = read(SEARCH_ROUTE);
  assert.match(src, /const limit = user \? FREE_SEARCH_LIMIT : ANON_SEARCH_LIMIT/);
});

test("the quota cookie is httpOnly — a page script can't forge its own remaining count", () => {
  const src = read(SEARCH_ROUTE);
  const setCalls = src.match(/res\.cookies\.set\(SEARCH_QUOTA_COOKIE,[^)]*\)/g) ?? [];
  assert.ok(setCalls.length >= 1, "expected at least one cookie write");
  for (const call of setCalls) assert.match(call, /httpOnly:\s*true/, `cookie write missing httpOnly: ${call}`);
});

// ── SearchBar gate UI ────────────────────────────────────────────────────────

const SEARCH_BAR = "src/components/SearchBar.tsx";

test("SearchBar renders the gate as an upsell, not a dead end", () => {
  const src = read(SEARCH_BAR);
  assert.match(src, /data\.limited/, "must read the route's limited flag");
  // Two distinct CTAs by tier: anon is pitched the account, an already-signed-in
  // free user (who can't sign up again) is pitched Premium instead.
  assert.match(src, /Create a free account/);
  assert.match(src, /Go Premium/);
  assert.match(src, /href="\/premium"/);
  assert.match(src, /href=\{`\/login\?next=/);
});

test("the gate's signup click is attributed with its own source", () => {
  const src = read(SEARCH_BAR);
  assert.match(src, /markSignupSource\("gate"\)/);
});

test("SIGNUP_SOURCES whitelists 'gate'", () => {
  const src = read("src/lib/signup-source-shared.ts");
  assert.match(src, /"gate"/);
});

test("a low-quota nudge appears before the gate, not just at zero", () => {
  const src = read(SEARCH_BAR);
  assert.match(src, /LOW_REMAINING_THRESHOLD/);
  assert.match(src, /left today/);
  assert.match(src, /Last free search today/);
});

// ── Navbar — no longer hidden pre-scroll on the homepage ────────────────────

test("HomeHeaderReveal is gone: the navbar (incl. sign-in) is unconditionally visible, homepage included", () => {
  assert.ok(!exists("src/components/HomeHeaderReveal.tsx"), "HomeHeaderReveal.tsx should be deleted, not just unused");
  const nav = read("src/components/Navbar.tsx");
  assert.ok(!/from "\.\/HomeHeaderReveal"/.test(nav), "the import must be gone");
  assert.ok(!/<HomeHeaderReveal/.test(nav), "no JSX usage may remain (a historical doc-comment mention of the retired name is fine)");
  // NavUser (the sign-in control) must render unconditionally — no wrapper
  // between it and the nav row that could hide it before scroll.
  const navUserLine = nav.split("\n").find((l) => l.includes("<NavUser"));
  assert.ok(navUserLine, "expected <NavUser /> in Navbar.tsx");
  assert.ok(!/hidden/.test(navUserLine!), "NavUser's own render line must carry no visibility gate");
});

// ── Premium page & popup advertise the ladder ────────────────────────────────

test("the /premium comparison table includes the search-limit row, sourced from the shared constants", () => {
  const src = read("src/app/premium/page.tsx");
  assert.match(src, /ANON_SEARCH_LIMIT, FREE_SEARCH_LIMIT \} from "@\/lib\/search-limits"/);
  assert.match(src, /feature: "Card searches per day"/);
  assert.match(src, /premium: "Unlimited"/);
});

test("the signup popup pitches the search-limit ladder with real numbers, not hardcoded ones", () => {
  const src = read("src/components/SignupPromoPopup.tsx");
  assert.match(src, /ANON_SEARCH_LIMIT, FREE_SEARCH_LIMIT \} from "@\/lib\/search-limits"/);
  assert.match(src, /\{ANON_SEARCH_LIMIT\}/);
  assert.match(src, /\{FREE_SEARCH_LIMIT\}/);
});
