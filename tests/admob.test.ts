import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bannerAdId, adsAreLive } from "../src/lib/admob";

// bannerAdId() has three tiers, checked in this order:
//   1. NEXT_PUBLIC_ADMOB_BANNER_* website env var — always wins when set, so ad
//      units keep changing without a store rebuild.
//   2. The RCAdMobBanner<Platform>/<id> token mobile/capacitor.config.ts embeds
//      in the app's own WebView User-Agent (appendUserAgent) — the id the app
//      was actually built with, as a floor.
//   3. Google's tap-safe test id.
//
// This file is what stands between a bug in that ordering and a build silently
// shipping test ads forever, or worse, the reverse — ignoring a real env-var
// update because a stale native override kept winning.

const REAL_ENV_ID = "ca-app-pub-1111111111111111/2222222222";
const REAL_NATIVE_ID = "ca-app-pub-6842128782879909/1664605849";
// The exact shape mobile/capacitor.config.ts embeds: the id's one "/" swapped
// for "_", since UA tokens are space-delimited, not slash-delimited.
const NATIVE_UA = `Mozilla/5.0 (Linux; Android 14) RiftCompareApp RCAdMobBannerAndroid/${REAL_NATIVE_ID.replace("/", "_")}`;
const PLAIN_WEB_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36";

/** Run `fn` with a fake `navigator.userAgent` and specific env vars, restoring
 *  both afterwards — bannerAdId() reads both as ambient global state.
 *
 *  Uses Object.defineProperty rather than a plain `globalThis.navigator = ...`
 *  assignment: Node 20+ defines a built-in global `navigator` as a getter-only
 *  accessor (no setter), so ordinary assignment silently no-ops instead of
 *  throwing — every test that tried to set a native-UA navigator this way
 *  passed with the args recorded but ran against Node's own "Node.js/NN.N"
 *  user agent underneath, not the fake one. It IS configurable, so redefining
 *  it (and restoring the exact original descriptor afterwards) works. */
function withEnv<T>(userAgent: string | undefined, env: Record<string, string | undefined>, fn: () => T): T {
  const hadNavigator = Object.prototype.hasOwnProperty.call(globalThis, "navigator");
  const prevDescriptor = hadNavigator ? Object.getOwnPropertyDescriptor(globalThis, "navigator") : undefined;
  const prevEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) prevEnv[key] = process.env[key];

  if (userAgent === undefined) {
    delete (globalThis as { navigator?: unknown }).navigator;
  } else {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent },
      configurable: true,
      writable: true,
      enumerable: true,
    });
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    if (prevDescriptor) Object.defineProperty(globalThis, "navigator", prevDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
    for (const key of Object.keys(env)) {
      if (prevEnv[key] === undefined) delete process.env[key];
      else process.env[key] = prevEnv[key];
    }
  }
}

test("no env var, no native override, no navigator (SSR): the tap-safe test id", () => {
  withEnv(undefined, { NEXT_PUBLIC_ADMOB_BANNER_ANDROID: undefined }, () => {
    assert.equal(bannerAdId("android"), "ca-app-pub-3940256099942544/6300978111");
    assert.equal(adsAreLive("android"), false);
  });
});

test("plain web UA, no env var: still the test id (a browser never carries the native token)", () => {
  withEnv(PLAIN_WEB_UA, { NEXT_PUBLIC_ADMOB_BANNER_ANDROID: undefined }, () => {
    assert.equal(bannerAdId("android"), "ca-app-pub-3940256099942544/6300978111");
    assert.equal(adsAreLive("android"), false);
  });
});

test("native UA override present, no env var: the id the app was built with, and ads go live", () => {
  withEnv(NATIVE_UA, { NEXT_PUBLIC_ADMOB_BANNER_ANDROID: undefined }, () => {
    assert.equal(bannerAdId("android"), REAL_NATIVE_ID);
    assert.equal(adsAreLive("android"), true);
  });
});

test("env var set: wins over the native override every time", () => {
  withEnv(NATIVE_UA, { NEXT_PUBLIC_ADMOB_BANNER_ANDROID: REAL_ENV_ID }, () => {
    assert.equal(bannerAdId("android"), REAL_ENV_ID);
  });
});

test("env var set to whitespace only: treated as unset, native override still applies", () => {
  withEnv(NATIVE_UA, { NEXT_PUBLIC_ADMOB_BANNER_ANDROID: "   " }, () => {
    assert.equal(bannerAdId("android"), REAL_NATIVE_ID);
  });
});

test("the native override is Android-only: iOS ignores it and falls back to the test id", () => {
  withEnv(NATIVE_UA, { NEXT_PUBLIC_ADMOB_BANNER_IOS: undefined }, () => {
    assert.equal(bannerAdId("ios"), "ca-app-pub-3940256099942544/2934735716");
    assert.equal(adsAreLive("ios"), false);
  });
});

test("mobile/capacitor.config.ts actually embeds a real (non-test) Android banner id", () => {
  // Tied to the real file rather than duplicating REAL_NATIVE_ID as a literal
  // here, so this catches drift between the two files without needing to be
  // hand-edited every time the id is rotated in capacitor.config.ts.
  const config = readFileSync("mobile/capacitor.config.ts", "utf8");
  const match = config.match(/appendUserAgent:\s*"[^"]*RCAdMobBannerAndroid\/(\S+?)"/);
  assert.ok(match, "capacitor.config.ts must embed an RCAdMobBannerAndroid/<id> token in appendUserAgent");
  const embeddedId = match![1].replace("_", "/");

  assert.match(embeddedId, /^ca-app-pub-\d+\/\d+$/, "embedded id must have the real ca-app-pub-<app>/<unit> shape");
  assert.notEqual(embeddedId, "ca-app-pub-3940256099942544/6300978111", "must not be Google's test banner id");

  withEnv(`Mozilla/5.0 RCAdMobBannerAndroid/${match![1]}`, { NEXT_PUBLIC_ADMOB_BANNER_ANDROID: undefined }, () => {
    assert.equal(bannerAdId("android"), embeddedId, "admob.ts must decode the embedded token back to this exact id");
  });
});
