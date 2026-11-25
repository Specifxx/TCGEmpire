import { test } from "node:test";
import assert from "node:assert/strict";
import { ANDROID_STRIP_BOOT } from "../src/components/AndroidStripClose";

// Runs the inline boot script against a fake page and reports whether the Android line was shown.
function run(opts: { ua: string; path?: string; closedUntil?: number; seen?: boolean; capacitor?: boolean }) {
  const strip = { style: { display: "none" } };
  const holiday = { style: { display: "" } };
  const local: Record<string, string> = opts.closedUntil ? { "rc-android-strip-closed": String(opts.closedUntil) } : {};
  const session: Record<string, string> = opts.seen ? { "rc-android-strip-seen": "1" } : {};
  const store = (m: Record<string, string>) => ({ getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => (m[k] = v) });
  const window: Record<string, unknown> = opts.capacitor ? { Capacitor: {} } : {};
  const fn = new Function("document", "navigator", "location", "localStorage", "sessionStorage", "window", ANDROID_STRIP_BOOT);
  fn(
    { currentScript: { previousElementSibling: strip }, querySelector: () => holiday },
    { userAgent: opts.ua },
    { pathname: opts.path ?? "/cards" },
    store(local),
    store(session),
    window,
  );
  return { shown: strip.style.display === "", holidayHidden: holiday.style.display === "none", session };
}

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

test("Android browser, first page of a visit: shown, sale line hidden, marked seen", () => {
  const r = run({ ua: ANDROID });
  assert.equal(r.shown, true);
  assert.equal(r.holidayHidden, true);
  assert.equal(r.session["rc-android-strip-seen"], "1");
});

test("never for iPhone, desktop, the app's WebView or the Capacitor runtime", () => {
  assert.equal(run({ ua: IPHONE }).shown, false);
  assert.equal(run({ ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0" }).shown, false);
  assert.equal(run({ ua: WEBVIEW }).shown, false);
  assert.equal(run({ ua: ANDROID, capacitor: true }).shown, false);
});

test("one prompt per visit, 30-day close, never on /android", () => {
  assert.equal(run({ ua: ANDROID, seen: true }).shown, false);
  assert.equal(run({ ua: ANDROID, closedUntil: Date.now() + 86_400_000 }).shown, false);
  assert.equal(run({ ua: ANDROID, closedUntil: Date.now() - 1 }).shown, true);
  assert.equal(run({ ua: ANDROID, path: "/android" }).shown, false);
  assert.equal(run({ ua: ANDROID, seen: true }).holidayHidden, false);
});
