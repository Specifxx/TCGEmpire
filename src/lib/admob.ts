// Google AdMob configuration for the native app (iOS + Android).
//
// These are AD UNIT ids. They are distinct from the AdMob APP id, which lives in
// the native projects (mobile/android .../strings.xml and mobile/ios .../Info.plist).
//
// The defaults below are Google's OFFICIAL TEST ad unit ids: they always serve
// test ads and are 100% safe to ship while developing — you can even tap them.
// Replace per-platform via env once your real ad units exist:
//
//   NEXT_PUBLIC_ADMOB_BANNER_ANDROID   = ca-app-pub-XXXX/XXXX
//   NEXT_PUBLIC_ADMOB_BANNER_IOS       = ca-app-pub-XXXX/XXXX
//   NEXT_PUBLIC_ADMOB_INTERSTITIAL_*   = ca-app-pub-XXXX/XXXX   (optional)
//
// WARNING: never tap your own LIVE ads in production — AdMob bans the account for
// invalid traffic. The test ids (defaults) are tap-safe.

export type NativePlatform = "ios" | "android";

// Google's official test unit ids.
// https://developers.google.com/admob/android/test-ads
// https://developers.google.com/admob/ios/test-ads
const TEST = {
  banner: {
    ios: "ca-app-pub-3940256099942544/2934735716",
    android: "ca-app-pub-3940256099942544/6300978111",
  },
  interstitial: {
    ios: "ca-app-pub-3940256099942544/4411468910",
    android: "ca-app-pub-3940256099942544/1033173712",
  },
};

function pick(envVal: string | undefined, fallback: string): string {
  const v = (envVal ?? "").trim();
  return v.length > 0 ? v : fallback;
}

// Build-time AdMob banner override, carried in the app's own WebView
// User-Agent — see mobile/capacitor.config.ts's appendUserAgent comment for the
// full explanation. In short: it's a space-delimited token shaped
// `RCAdMobBanner<Platform>/<id>`, with the id's one "/" swapped for "_" because
// UA tokens are space-delimited, not slash-delimited. Returns undefined outside
// the app: older SSR runtimes have no `navigator` at all, and on a newer Node
// that defines one, or in a plain browser, the UA simply never contains this
// token, so the regex below just doesn't match.
function nativeUaBannerOverride(platform: NativePlatform): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const prefix = platform === "ios" ? "RCAdMobBannerIOS/" : "RCAdMobBannerAndroid/";
  // The "\\S" here is NOT decorative: a template literal OR a plain string
  // both process `\S` as an unrecognised escape and silently drop the
  // backslash (it becomes a literal "S"), so this has to be built with a
  // doubled backslash to actually reach the regex engine as "\S". Got this
  // wrong twice while writing it — first inside a template literal, then
  // inside a plain string with the same single backslash — and both versions
  // compiled cleanly and matched nothing, ever, silently falling back to test
  // ads on every build. Caught by tests/admob.test.ts, not by tsc or eslint.
  const match = navigator.userAgent.match(new RegExp(prefix + "(\\S+)"));
  const id = match?.[1]?.replace("_", "/");
  return id && id.length > 0 ? id : undefined;
}

// Same as pick(), but with a middle tier: the website env var always wins when
// set (so ad units keep changing without a store rebuild, exactly as designed),
// and ONLY when it isn't set does this fall back to whatever real id the app was
// actually built with, before falling back further to the tap-safe test id.
// Without this tier, a build made before the env var was ever configured on the
// website would silently serve test ads forever, even with a real AdMob App id
// wired up natively.
function pickBanner(envVal: string | undefined, platform: NativePlatform, fallback: string): string {
  const v = (envVal ?? "").trim();
  if (v.length > 0) return v;
  return nativeUaBannerOverride(platform) ?? fallback;
}

export function bannerAdId(platform: NativePlatform): string {
  return platform === "ios"
    ? pickBanner(process.env.NEXT_PUBLIC_ADMOB_BANNER_IOS, "ios", TEST.banner.ios)
    : pickBanner(process.env.NEXT_PUBLIC_ADMOB_BANNER_ANDROID, "android", TEST.banner.android);
}

export function interstitialAdId(platform: NativePlatform): string {
  return platform === "ios"
    ? pick(process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_IOS, TEST.interstitial.ios)
    : pick(process.env.NEXT_PUBLIC_ADMOB_INTERSTITIAL_ANDROID, TEST.interstitial.android);
}

// True only when a REAL (non-test) banner unit is configured for this platform.
// Drives isTesting=false so the SDK requests real ads; with the test defaults it
// stays false → always click-safe test ads.
export function adsAreLive(platform: NativePlatform): boolean {
  const testUnit = platform === "ios" ? TEST.banner.ios : TEST.banner.android;
  return bannerAdId(platform) !== testUnit;
}
