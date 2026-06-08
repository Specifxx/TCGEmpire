"use client";

import { useEffect } from "react";
import { adsAreLive, bannerAdId, type NativePlatform } from "@/lib/admob";

// Bridges the website to its native iOS/Android shell (Capacitor).
//
// When the site runs inside the native app it: styles the status bar, shows a
// native AdMob banner, handles the Android hardware back button, and tags <html>
// with `capacitor-native` (globals.css uses that to hide web AdSense and reserve
// space for the banner). On the plain web it renders nothing AND loads no native
// code — every dynamic import sits behind the `isNativePlatform` check, so normal
// browser visitors never download the Capacitor/AdMob chunks.
export function NativeShell() {
  useEffect(() => {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return; // plain web browser → no-op

    const platform: NativePlatform = cap.getPlatform?.() === "ios" ? "ios" : "android";
    document.documentElement.classList.add("capacitor-native", `capacitor-${platform}`);

    let removeBackListener: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const [admob, statusBar, appPlugin] = await Promise.all([
          import("@capacitor-community/admob"),
          import("@capacitor/status-bar"),
          import("@capacitor/app"),
        ]);
        if (cancelled) return;

        const { AdMob, BannerAdSize, BannerAdPosition } = admob;
        const { StatusBar, Style } = statusBar;
        const { App } = appPlugin;

        // Dark status bar to match the app chrome.
        try {
          await StatusBar.setStyle({ style: Style.Dark });
          if (platform === "android") {
            await StatusBar.setBackgroundColor({ color: "#0a0f1a" });
          }
        } catch {
          /* status bar plugin unavailable — non-fatal */
        }

        // Android hardware back button: navigate back within the app, exit at root.
        if (platform === "android") {
          const handle = await App.addListener("backButton", ({ canGoBack }) => {
            if (canGoBack || window.history.length > 1) window.history.back();
            else App.exitApp();
          });
          removeBackListener = () => handle.remove();
        }

        // --- AdMob ---
        const live = adsAreLive(platform);

        // iOS: ask for tracking permission before the SDK reads the IDFA. Declining
        // is fine — the SDK falls back to non-personalised ads.
        try {
          if (platform === "ios") await AdMob.requestTrackingAuthorization();
        } catch {
          /* ATT unavailable (e.g. older iOS) — continue with non-personalised ads */
        }

        await AdMob.initialize({ initializeForTesting: !live, testingDevices: [] });
        if (cancelled) return;

        await AdMob.showBanner({
          adId: bannerAdId(platform),
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: !live,
        });

        document.documentElement.classList.add("has-native-banner");
      } catch (err) {
        // Ads/native niceties must never break the actual app.
        // eslint-disable-next-line no-console
        console.warn("[RiftCompare] native shell init failed", err);
      }
    })();

    return () => {
      cancelled = true;
      removeBackListener?.();
    };
  }, []);

  return null;
}
