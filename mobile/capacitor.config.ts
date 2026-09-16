import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RiftCompare native app configuration.
 *
 * Strategy: a native shell that loads the live https://riftcompare.com inside a
 * native WebView, with native AdMob banner ads layered on top and the web ad
 * network suppressed in-app. The web app detects the Capacitor runtime
 * (window.Capacitor.isNativePlatform()) and adapts itself — see
 * src/components/NativeShell.tsx in the Next.js project.
 *
 * Everything bundled in www/ ships inside the binary and is what the app falls
 * back to when the network is down (see MainActivity's OfflineWebViewClient),
 * so the user gets a branded "you're offline, retry" screen rather than
 * Chrome's error page.
 */
const config: CapacitorConfig = {
  appId: "com.riftcompare.app",
  appName: "RiftCompare",
  // Local bundle: the launch shell + the offline fallback page. With server.url
  // set below the app normally loads the live site over the top of it.
  webDir: "www",
  // Dark base colour shown behind the WebView before the page paints — matches
  // the site's ink-950 background so there is no white flash on launch.
  backgroundColor: "#0a0f1a",
  server: {
    // Load the live, server-rendered site. This keeps the app 100% in sync with
    // the website (auth, browse, price comparison) with zero duplicate code.
    url: "https://riftcompare.com",
    // Never allow plaintext HTTP — the site is HTTPS-only.
    cleartext: false,
    // When a main-frame navigation fails (no signal, plane mode, DNS down) the
    // WebView shows Chrome's "webpage not available" error by default, which
    // looks like the app itself broke. Capacitor's errorPath swaps in our own
    // bundled screen instead — WebViewLocalServer.shouldInterceptRequest treats
    // the error URL as local, so it is served from the binary and works with no
    // network at all.
    errorPath: "offline.html",
    // Hosts the in-app WebView is allowed to stay on.
    //
    // The OAuth providers are here on purpose. Sign-in on riftcompare.com is a
    // first-party redirect chain (/api/auth/oauth/<p> → provider → /callback,
    // which sets the httpOnly session cookie). If the provider host is NOT on
    // this list Capacitor punts it to the external browser, the callback then
    // sets the session cookie in *that* browser's cookie jar, and the app's
    // WebView comes back still signed out — sign-in silently does nothing.
    // Keeping the whole chain in one WebView keeps the cookie where it belongs.
    //
    // See README "Sign-in inside the app" for the one provider this cannot fix
    // (Google refuses OAuth in embedded WebViews by policy).
    allowNavigation: [
      "riftcompare.com",
      "*.riftcompare.com",
      "discord.com",
      "*.discord.com",
      "accounts.google.com",
    ],
  },
  // Appended to the WebView's User-Agent on both platforms, as space-delimited
  // tokens. This is the ONLY signal the website has, at first byte, that it is
  // running in the app.
  //
  //   RiftCompareApp                    — the <head> boot script in
  //                                        src/lib/native-boot.ts reads this to
  //                                        stamp <html> and stop AdSense
  //                                        requesting ads in-app (app inventory
  //                                        is AdMob's). Keep in sync with
  //                                        NATIVE_UA_TOKEN there;
  //                                        tests/native-boot.test.ts asserts it.
  //
  //   RCAdMobBannerAndroid/<id>          — the real Android AdMob banner ad
  //                                        unit id, read by src/lib/admob.ts.
  //                                        Ad units are still primarily driven
  //                                        by the NEXT_PUBLIC_ADMOB_BANNER_*
  //                                        website env vars (so they can change
  //                                        without a store rebuild) — this is
  //                                        only a build-time FLOOR, for a build
  //                                        made before that env var is ever
  //                                        set on the website deployment. The
  //                                        id's one "/" is swapped for "_"
  //                                        because UA tokens are
  //                                        space-delimited, not
  //                                        slash-delimited; admob.ts reverses
  //                                        it. tests/admob.test.ts asserts this
  //                                        decodes to a real (non-test)
  //                                        ca-app-pub id.
  appendUserAgent: "RiftCompareApp RCAdMobBannerAndroid/ca-app-pub-6842128782879909_1664605849",
  ios: {
    contentInset: "always",
  },
  android: {
    // Show a native loading background, not a white screen, while the page loads.
    backgroundColor: "#0a0f1a",
    // Android 15 (API 35) forces edge-to-edge on every app and stops honouring
    // the old opt-out. Capacitor's "auto" keeps the WebView clear of the status
    // and navigation bars so the site's own safe-area CSS still lines up.
    adjustMarginsForEdgeToEdge: "auto",
  },
  plugins: {
    SplashScreen: {
      // NativeShell.tsx calls SplashScreen.hide() as soon as the site's first
      // paint lands, so in practice the splash is up for well under this.
      // launchAutoHide stays TRUE on purpose: with it false, any failure to
      // reach that hide() call — no network, a JS error, an old WebView that
      // chokes on the bundle — leaves the splash up forever and the app looks
      // frozen with no way back. The duration below is the backstop.
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0a0f1a",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0f1a",
      overlaysWebView: false,
    },
    Keyboard: {
      // Let the page resize rather than pan, so a focused search input never
      // ends up underneath the keyboard.
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
