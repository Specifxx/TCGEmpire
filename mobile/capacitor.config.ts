import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RiftCompare native app configuration.
 *
 * Strategy: a thin native shell that loads the live https://riftcompare.com
 * inside a native WebView, with native AdMob banner ads layered on top and the
 * web AdSense suppressed in-app. The web app detects the Capacitor runtime
 * (window.Capacitor.isNativePlatform()) and adapts itself — see
 * src/components/NativeShell.tsx in the Next.js project.
 */
const config: CapacitorConfig = {
  appId: "com.riftcompare.app",
  appName: "RiftCompare",
  // Local fallback bundle. With `server.url` set below, the app loads the live
  // site instead; `www/` is only the shell/splash that ships inside the binary.
  webDir: "www",
  // Dark base colour shown behind the WebView before the page paints — matches
  // the site's ink-950 background so there is no white flash on launch.
  backgroundColor: "#0a0f1a",
  server: {
    // Load the live, server-rendered site. This keeps the app 100% in sync with
    // the website (auth, browse, price comparison, forum) with zero duplicate code.
    url: "https://riftcompare.com",
    // Never allow plaintext HTTP — the site is HTTPS-only.
    cleartext: false,
    // Hosts the in-app WebView is allowed to stay on. Anything else (retailer
    // "buy" links) is opened in the system browser by OutboundLink.tsx.
    allowNavigation: ["riftcompare.com", "*.riftcompare.com"],
  },
  ios: {
    contentInset: "always",
  },
  android: {
    // Show a native loading background, not a white screen, while the page loads.
    backgroundColor: "#0a0f1a",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0a0f1a",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
