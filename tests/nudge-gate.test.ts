import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ANNUAL_MIN_VIEWS,
  DIALOG_QUIET_MS,
  PREMIUM_MIN_ACCOUNT_AGE_MS,
  PREMIUM_MIN_VIEWS,
  PREMIUM_SKIP_PATHS,
  accountAgeMs,
  isTextEntry,
  pathSkipped,
  premiumSlideInEligible,
  quietWaitMs,
  type QuietInput,
} from "../src/lib/nudge-gate";
import { MAX_NUDGE_DISMISSALS, NUDGE_DELAY_MS, SNOOZE_AFTER_CLICK_MS, SNOOZE_AFTER_DISMISS_MS } from "../src/lib/nudge-timing";

// ─────────────────────────────────────────────────────────────────────────────
// "Nudges: value first" (DECISIONS.md, 2026-09-29). These run the ELIGIBILITY
// rules of the corner cards as behaviour, not as source patterns: page-view
// counts, dialogs, focused inputs, dismissal snoozes and account age.
// tests/first-visit-ux.test.ts, nudge-timing.test.ts and nudge-frequency.test.ts
// pin that the components USE them. The signed-out sign-up card's own rules
// (first page view, engaged time, sign-in intent) went with the card itself on
// 2026-09-30 ("The sign-up slider is gone", tests/signup-inline.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test("the constants are the owner's rules, in one place", () => {
  assert.equal(NUDGE_DELAY_MS, 12_000);
  assert.equal(PREMIUM_MIN_VIEWS, 3);
  assert.equal(PREMIUM_MIN_ACCOUNT_AGE_MS, 48 * HOUR);
  assert.equal(ANNUAL_MIN_VIEWS, 2);
  assert.equal(DIALOG_QUIET_MS, 10_000);
  // The caps and snoozes the nudges keep, unchanged by this pass.
  assert.equal(MAX_NUDGE_DISMISSALS, 2);
  assert.equal(SNOOZE_AFTER_DISMISS_MS, 7 * DAY);
  assert.equal(SNOOZE_AFTER_CLICK_MS, 14 * DAY);
});

// ── The Premium slide-in ────────────────────────────────────────────────────

const OLD = 3 * DAY;

test("premium slide-in: not on the session's first two page views, from the 3rd", () => {
  assert.equal(premiumSlideInEligible({ views: 1, accountAgeMs: OLD, pathname: "/browse" }), false);
  assert.equal(premiumSlideInEligible({ views: 2, accountAgeMs: OLD, pathname: "/browse" }), false);
  assert.equal(premiumSlideInEligible({ views: 3, accountAgeMs: OLD, pathname: "/browse" }), true);
  assert.equal(premiumSlideInEligible({ views: 0, accountAgeMs: OLD, pathname: "/browse" }), false, "route not counted yet");
});

test("premium slide-in: not for an account under 48 hours old; unknown age fails closed", () => {
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: 47 * HOUR + 59 * 60_000, pathname: "/" }), false);
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: 48 * HOUR, pathname: "/" }), true);
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: 0, pathname: "/" }), false);
  assert.equal(premiumSlideInEligible({ views: 5, accountAgeMs: null, pathname: "/" }), false, "no createdAt, no ask");
});

test("pathSkipped matches whole path segments only", () => {
  const skips = ["/login", "/premium"];
  for (const p of ["/login", "/login/x", "/premium", "/premium/success"]) assert.equal(pathSkipped(p, skips), true, p);
  for (const p of ["/", "/card/x", "/browse", "/premiumish", "/loginx", null, undefined]) assert.equal(pathSkipped(p, skips), false, String(p));
});

test("accountAgeMs reads /api/me's ISO createdAt and never invents an age", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  assert.equal(accountAgeMs("2026-09-27T12:00:00Z", now), 48 * HOUR);
  assert.equal(accountAgeMs("2026-09-29T11:00:00Z", now), HOUR);
  assert.equal(accountAgeMs(new Date("2026-09-28T12:00:00Z"), now), 24 * HOUR);
  assert.equal(accountAgeMs("2026-09-30T12:00:00Z", now), 0, "a clock-skewed future date is a brand-new account");
  for (const bad of [null, undefined, "", "not a date"]) assert.equal(accountAgeMs(bad as string | null | undefined, now), null, String(bad));
});

test("premium slide-in: never on a page with its own inline paid prompt, or on the sign-in pages", () => {
  for (const p of [
    "/tools", "/tools/deal-finder", "/tools/best-basket", "/portfolio", "/portfolio/sets", "/watching", "/sealed", "/sealed/x",
    "/premium", "/login", "/verify",
  ]) {
    assert.equal(premiumSlideInEligible({ views: 9, accountAgeMs: OLD, pathname: p }), false, p);
  }
  for (const p of ["/", "/browse", "/card/some-card", "/deck", "/movers", "/blog/x", "/toolsmith", "/watchingx"]) {
    assert.equal(premiumSlideInEligible({ views: 9, accountAgeMs: OLD, pathname: p }), true, p);
  }
  for (const p of ["/login", "/verify", "/premium", "/tools", "/portfolio", "/watching", "/sealed"]) {
    assert.ok((PREMIUM_SKIP_PATHS as readonly string[]).includes(p), `${p} is in the list`);
  }
});

// ── Never mid-task ──────────────────────────────────────────────────────────

const CALM: QuietInput = {
  dialogOpen: false,
  inputFocused: false,
  sinceDialogClosedMs: Infinity,
  sinceScrollMs: Infinity,
  sinceKeyMs: Infinity,
};

test("quietWaitMs: 0 when nothing is going on", () => {
  assert.equal(quietWaitMs(CALM), 0);
});

test("quietWaitMs: never over an open dialog or drawer", () => {
  assert.ok(quietWaitMs({ ...CALM, dialogOpen: true }) > 0);
});

test("quietWaitMs: never while a text field has focus", () => {
  assert.ok(quietWaitMs({ ...CALM, inputFocused: true }) > 0);
});

test("quietWaitMs: not within 10 s of a dialog closing, and it says how long is left", () => {
  assert.equal(quietWaitMs({ ...CALM, sinceDialogClosedMs: 0 }), DIALOG_QUIET_MS);
  assert.equal(quietWaitMs({ ...CALM, sinceDialogClosedMs: 4_000 }), 6_000);
  assert.equal(quietWaitMs({ ...CALM, sinceDialogClosedMs: 10_000 }), 0);
  assert.equal(quietWaitMs({ ...CALM, sinceDialogClosedMs: 30_000 }), 0);
});

test("quietWaitMs: not mid-scroll and not mid-typing", () => {
  assert.equal(quietWaitMs({ ...CALM, sinceScrollMs: 200 }), 800);
  assert.equal(quietWaitMs({ ...CALM, sinceScrollMs: 1_000 }), 0);
  assert.equal(quietWaitMs({ ...CALM, sinceKeyMs: 500 }), 2_500);
  assert.equal(quietWaitMs({ ...CALM, sinceKeyMs: 3_000 }), 0);
  assert.equal(quietWaitMs({ ...CALM, sinceScrollMs: 200, sinceKeyMs: 500 }), 2_500, "the longest wait wins");
});

test("isTextEntry: inputs you type in, not buttons and checkboxes", () => {
  assert.equal(isTextEntry({ tagName: "INPUT", type: "text" }), true);
  assert.equal(isTextEntry({ tagName: "INPUT", type: "search" }), true);
  assert.equal(isTextEntry({ tagName: "input", type: "email" }), true);
  assert.equal(isTextEntry({ tagName: "INPUT" }), true, "a bare input is a text input");
  assert.equal(isTextEntry({ tagName: "TEXTAREA" }), true);
  assert.equal(isTextEntry({ tagName: "SELECT" }), true);
  assert.equal(isTextEntry({ tagName: "DIV", isContentEditable: true }), true);
  for (const type of ["button", "submit", "checkbox", "radio", "range"]) assert.equal(isTextEntry({ tagName: "INPUT", type }), false, type);
  assert.equal(isTextEntry({ tagName: "A" }), false);
  assert.equal(isTextEntry({ tagName: "BODY" }), false);
  assert.equal(isTextEntry(null), false);
});

// ── The browser half: armNudge and the page-view counter, against a fake DOM ─

type Fn = (e?: unknown) => void;
const listeners = new Map<string, Set<Fn>>();
const winListeners = new Map<string, Set<Fn>>();
const observers: Array<() => void> = [];
const add = (m: Map<string, Set<Fn>>) => (t: string, f: Fn) => void (m.get(t) ?? m.set(t, new Set()).get(t)!).add(f);
const rm = (m: Map<string, Set<Fn>>) => (t: string, f: Fn) => void m.get(t)?.delete(f);
const fire = (m: Map<string, Set<Fn>>, t: string, e?: unknown) => [...(m.get(t) ?? [])].forEach((f) => f(e));

const doc = {
  body: { dataset: {} as Record<string, string> },
  activeElement: null as unknown,
  visibilityState: "visible",
  addEventListener: add(listeners),
  removeEventListener: rm(listeners),
};
const store = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.document = doc;
g.window = { addEventListener: add(winListeners), removeEventListener: rm(winListeners), location: { origin: "https://riftcompare.test", search: "" } };
g.MutationObserver = class {
  constructor(cb: () => void) {
    observers.push(cb);
  }
  observe() {}
};
g.sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const setDialog = (open: boolean) => {
  if (open) doc.body.dataset.rcDialog = "1";
  else delete doc.body.dataset.rcDialog;
  observers.forEach((cb) => cb());
};

// Every test starts its fake clock ten minutes after the last one, because the
// runtime keeps "when did a dialog last close / the visitor last scroll" at
// module level, exactly as it does in a page.
let clockBase = 1_000_000_000_000;
function startClock() {
  clockBase += 10 * 60_000;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: clockBase });
}

async function loadRuntime() {
  return (await import("../src/lib/nudge-runtime")) as typeof import("../src/lib/nudge-runtime");
}

test("armNudge fires once, after the delay, at a quiet moment", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(NUDGE_DELAY_MS - 1);
    assert.equal(fired, 0, "not one millisecond early");
    mock.timers.tick(1);
    assert.equal(fired, 1, "12 s after it was armed");
    mock.timers.tick(60_000);
    assert.equal(fired, 1, "and only once");
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: cleanup (navigating away) cancels a pending show", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(5_000);
    stop();
    mock.timers.tick(60_000);
    assert.equal(fired, 0);
    assert.equal(listeners.get("focusin")?.size ?? 0, 0, "and its listeners are gone");
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: opening a dialog or drawer cancels the wait; it restarts, quiet, after it closes", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(8_000);
    setDialog(true);
    mock.timers.tick(60_000);
    assert.equal(fired, 0, "never over an open dialog, however long it stays open");
    setDialog(false);
    mock.timers.tick(NUDGE_DELAY_MS - 1);
    assert.equal(fired, 0, "a full fresh wait after it closes, not the remainder of the old one");
    mock.timers.tick(1);
    assert.equal(fired, 1);
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: with no delay, still not within 10 s of a dialog closing", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: 0, onFire: () => fired++ });
    // armed at once with delay 0 would already have a timer; open the dialog first.
    stop();
    setDialog(true);
    setDialog(false);
    const stop2 = armNudge({ delayMs: 0, onFire: () => fired++ });
    mock.timers.tick(DIALOG_QUIET_MS - 1);
    assert.equal(fired, 0);
    mock.timers.tick(1);
    assert.equal(fired, 1);
    stop2();
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: focusing a text field cancels the wait; leaving it restarts", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(10_000);
    const input = { tagName: "INPUT", type: "search" };
    doc.activeElement = input;
    fire(listeners, "focusin", { target: input });
    mock.timers.tick(120_000);
    assert.equal(fired, 0, "never while the search box has focus");
    doc.activeElement = null;
    fire(listeners, "focusout");
    mock.timers.tick(5); // the blur is looked at a tick later (activeElement updates after focusout)
    mock.timers.tick(NUDGE_DELAY_MS - 1);
    assert.equal(fired, 0, "a full fresh wait after the blur");
    mock.timers.tick(1);
    assert.equal(fired, 1);
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: armed while a field already has focus, it waits for the blur", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const input = { tagName: "TEXTAREA" };
    doc.activeElement = input;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(200_000);
    assert.equal(fired, 0);
    doc.activeElement = null;
    fire(listeners, "focusout");
    mock.timers.tick(5);
    mock.timers.tick(NUDGE_DELAY_MS);
    assert.equal(fired, 1);
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: a visitor scrolling when the timer fires is not interrupted; it waits for them to stop", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(NUDGE_DELAY_MS - 300);
    fire(winListeners, "scroll");
    mock.timers.tick(300);
    assert.equal(fired, 0, "scrolled 300 ms ago: hold off");
    mock.timers.tick(699);
    assert.equal(fired, 0);
    mock.timers.tick(1);
    assert.equal(fired, 1, "a full second after the last scroll");
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("armNudge: typing when the timer fires is not interrupted either", async () => {
  const { armNudge } = await loadRuntime();
  startClock();
  try {
    let fired = 0;
    const stop = armNudge({ delayMs: NUDGE_DELAY_MS, onFire: () => fired++ });
    mock.timers.tick(NUDGE_DELAY_MS - 100);
    fire(listeners, "keydown");
    mock.timers.tick(100);
    assert.equal(fired, 0);
    mock.timers.tick(2_899);
    assert.equal(fired, 0);
    mock.timers.tick(1);
    assert.equal(fired, 1, "three seconds after the last key");
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("countSessionView: distinct pages count, a reload of the same page does not, going back does", async () => {
  const { countSessionView } = await loadRuntime();
  store.clear();
  assert.equal(countSessionView("k", "/a"), 1);
  assert.equal(countSessionView("k", "/a"), 1, "a reload or re-render is not a second page");
  assert.equal(countSessionView("k", "/b"), 2);
  assert.equal(countSessionView("k", "/a"), 3, "A to B to A is three page views");
  assert.equal(countSessionView("other", "/a"), 1, "each nudge counts under its own key");
  assert.equal(store.get("k"), "3");
});

test("dismissal snoozes: a dismissal is a week, a click a fortnight, two dismissals forever", () => {
  // The caps the arming effects read; the numbers themselves are pinned above
  // and the enforcement order by tests/nudge-frequency.test.ts.
  const now = Date.parse("2026-09-29T12:00:00Z");
  const snoozedUntil = now + SNOOZE_AFTER_DISMISS_MS;
  assert.ok(now + 6 * DAY < snoozedUntil, "day 6: still quiet");
  assert.ok(now + 7 * DAY >= snoozedUntil, "day 7: may ask again");
  assert.ok(now + 13 * DAY < now + SNOOZE_AFTER_CLICK_MS, "an engaged click buys longer quiet than a refusal");
  assert.ok(2 >= MAX_NUDGE_DISMISSALS, "the second dismissal is the last");
});

test("the annual offer waits for the session's 2nd page view", () => {
  const src = readFileSync(join(process.cwd(), "src/components/AnnualSwitchNudge.tsx"), "utf8");
  assert.match(src, /const pastFirstPage = views >= ANNUAL_MIN_VIEWS;/);
  assert.match(src, /if \(!loaded \|\| !premium \|\| !pastFirstPage \|\| checked\.current\) return;/);
});
