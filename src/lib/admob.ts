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

export function bannerAdId(platform: NativePlatform): string {
  return platform === "ios"
    ? pick(process.env.NEXT_PUBLIC_ADMOB_BANNER_IOS, TEST.banner.ios)
    : pick(process.env.NEXT_PUBLIC_ADMOB_BANNER_ANDROID, TEST.banner.android);
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
