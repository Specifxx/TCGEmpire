import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  NATIVE_BOOT_SCRIPT,
  NATIVE_HTML_CLASS,
  NATIVE_UA_TOKEN,
  isNativeUserAgent,
} from "../src/lib/native-boot";

// The <head> boot script is the one thing standing between the native app and
// an AdSense policy violation (two ad stacks in one WebView — see
// src/lib/native-boot.ts). It ships as a hand-written ES5 string, so it gets
// executed here rather than merely eyeballed.

/** Run NATIVE_BOOT_SCRIPT against a minimal fake document/window. */
function boot(userAgent: string) {
  const classes = new Set<string>();
  const sandbox = {
    navigator: { userAgent },
    document: { documentElement: { classList: { add: (c: string) => classes.add(c) } } },
    window: {} as Record<string, unknown>,
  };
  (sandbox as unknown as { globalThis: unknown }).globalThis = sandbox;
  runInNewContext(NATIVE_BOOT_SCRIPT, sandbox);
  return { classes, adsbygoogle: sandbox.window.adsbygoogle as undefined | { pauseAdRequests?: number } };
}

const WEB_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const APP_UA = `${WEB_UA} ${NATIVE_UA_TOKEN}`;

test("in the app: flags <html> and pauses AdSense ad requests", () => {
  const { classes, adsbygoogle } = boot(APP_UA);
  assert.ok(classes.has(NATIVE_HTML_CLASS), "should stamp the native class on <html>");
  assert.equal(adsbygoogle?.pauseAdRequests, 1, "should pause AdSense requests in-app");
});

test("on the plain web: touches nothing at all", () => {
  const { classes, adsbygoogle } = boot(WEB_UA);
  assert.equal(classes.size, 0, "must not stamp the native class on the web");
  assert.equal(adsbygoogle, undefined, "must not create or pause the AdSense queue on the web");
});

test("a broken navigator cannot break the page", () => {
  // The whole script is wrapped in try/catch precisely so a hostile or ancient
  // WebView cannot take the document down with it.
  const sandbox = { navigator: null, document: null, window: {} };
  assert.doesNotThrow(() => runInNewContext(NATIVE_BOOT_SCRIPT, sandbox));
});

test("isNativeUserAgent agrees with the inlined script", () => {
  assert.equal(isNativeUserAgent(APP_UA), true);
  assert.equal(isNativeUserAgent(WEB_UA), false);
});

test("the native shell actually appends the token the site looks for", () => {
  // If these two drift, the site silently goes back to serving AdSense in-app
  // and nothing else fails — so the config is asserted against the constant.
  //
  // appendUserAgent carries more than one space-delimited token (this one, plus
  // the AdMob banner override tests/admob.test.ts checks) so this only requires
  // NATIVE_UA_TOKEN to appear as a whole token — followed by a space (more
  // tokens) or the closing quote (nothing else) — not that it's the entire
  // string, and isNativeUserAgent (a substring search) doesn't care either way.
  const config = readFileSync("mobile/capacitor.config.ts", "utf8");
  assert.match(
    config,
    new RegExp(`appendUserAgent:\\s*"${NATIVE_UA_TOKEN}(\\s|")`),
    "mobile/capacitor.config.ts must append NATIVE_UA_TOKEN to the WebView User-Agent"
  );
});
