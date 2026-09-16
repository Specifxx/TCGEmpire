"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { adsAreLive, bannerAdId } from "@/lib/admob";
import { isNative, nativePlatform } from "@/lib/native";

const SITE_HOSTS = new Set(["riftcompare.com", "www.riftcompare.com"]);

/** How long a second back press still counts as "yes, really exit". */
const EXIT_CONFIRM_MS = 2000;

/**
 * A minimal transient message, used for the two things that have to be said
 * from outside React's tree (the back-button exit hint and the offline strip).
 *
 * Deliberately not ui/Toast: that lives behind a provider mounted further down
 * the tree, and this runs in a layout-level effect that can fire before — or
 * after — any of it exists. Sixteen lines of DOM has no such ordering problem.
 */
function flashMessage(text: string, ms = EXIT_CONFIRM_MS): () => void {
  const el = document.createElement("div");
  el.textContent = text;
  el.setAttribute("role", "status");
  el.style.cssText = [
    "position:fixed",
    "left:50%",
    "transform:translateX(-50%)",
    "bottom:calc(var(--native-banner-h, 0px) + env(safe-area-inset-bottom, 0px) + 5rem)",
    "z-index:2147483647",
    "padding:0.625rem 1rem",
    "border-radius:9999px",
    "background:rgba(17,24,39,0.96)",
    "color:#e5e9f0",
    "font-size:0.8125rem",
    "border:1px solid #1e2738",
    "pointer-events:none",
    "max-width:min(90vw,26rem)",
    "text-align:center",
  ].join(";");
  document.body.appendChild(el);
  const t = window.setTimeout(() => el.remove(), ms);
  return () => {
    window.clearTimeout(t);
    el.remove();
  };
}

/**
 * Bridges the website to its native iOS/Android shell (Capacitor, see mobile/).
 *
 * Inside the app it: dismisses the splash once the site has actually painted,
 * styles the status bar, shows a native AdMob banner and keeps the layout's
 * reserved space matched to the banner's REAL height, handles the Android
 * hardware back button, routes incoming deep links / launcher shortcuts into
 * the SPA router, and surfaces connectivity changes.
 *
 * On the plain web it renders nothing AND loads no native code — every dynamic
 * import sits behind the isNative() check, so browser visitors never download
 * the Capacitor or AdMob chunks.
 */
export function NativeShell() {
  const router = useRouter();

  useEffect(() => {
    if (!isNative()) return; // plain web browser → no-op
    const platform = nativePlatform() ?? "android";
    const root = document.documentElement;
    root.classList.add("capacitor-native", `capacitor-${platform}`);

    // Every listener/plugin-call that needs undoing is pushed here, and dispose()
    // drains it. The async setup below re-checks `disposed` after every await and
    // bails, so a fast unmount (React 18 StrictMode remounts this effect in dev,
    // and a route change can outrun a slow AdMob init) cannot leave a listener
    // attached or — the visible one — a second banner stacked on the first.
    let disposed = false;
    const teardown: Array<() => unknown> = [];

    async function dispose() {
      if (disposed) return;
      disposed = true;
      for (const fn of teardown.splice(0).reverse()) {
        try {
          await fn();
        } catch {
          /* tearing down must never throw */
        }
      }
      root.classList.remove(
        "capacitor-native",
        `capacitor-${platform}`,
        "has-native-banner",
        "keyboard-open",
        "is-offline"
      );
      root.style.removeProperty("--native-banner-h");
    }

    (async () => {
      // ---- Splash ---------------------------------------------------------
      // capacitor.config.ts keeps launchAutoHide on as a backstop; getting here
      // means the site has painted, so drop it now rather than sitting on a
      // static image for the remainder of launchShowDuration.
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide({ fadeOutDuration: 200 });
      } catch {
        /* plugin missing — the config's auto-hide still covers us */
      }
      if (disposed) return;

      // ---- Status bar -----------------------------------------------------
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        if (platform === "android") {
          await StatusBar.setBackgroundColor({ color: "#0a0f1a" });
        }
      } catch {
        /* status bar plugin unavailable — non-fatal */
      }
      if (disposed) return;

      // ---- Deep links & launcher shortcuts --------------------------------
      // An App Link (someone taps a riftcompare.com URL anywhere on the phone)
      // and a launcher long-press shortcut arrive identically, as an appUrlOpen
      // with the full https URL. Routing it through next/navigation keeps it a
      // client-side transition; letting the WebView navigate to the absolute URL
      // instead would tear down and re-boot the whole SPA on every deep link.
      const toInternalPath = (raw: string): string | null => {
        try {
          const u = new URL(raw);
          if (!SITE_HOSTS.has(u.host)) return null;
          return `${u.pathname}${u.search}${u.hash}` || "/";
        } catch {
          return null;
        }
      };
      const navigate = (raw: string) => {
        const path = toInternalPath(raw);
        if (!path) return;
        const here = `${window.location.pathname}${window.location.search}`;
        if (path === here) return;
        router.push(path);
      };

      try {
        const { App } = await import("@capacitor/app");
        if (disposed) return;

        // Cold start: the intent that launched us is waiting here, because the
        // WebView has already loaded server.url's root by the time we mount.
        try {
          const launch = await App.getLaunchUrl();
          if (!disposed && launch?.url) navigate(launch.url);
        } catch {
          /* no launch url */
        }

        const urlHandle = await App.addListener("appUrlOpen", ({ url }) => navigate(url));
        teardown.push(() => urlHandle.remove());
        if (disposed) return void dispose();

        // ---- Android hardware back button ---------------------------------
        if (platform === "android") {
          let armedUntil = 0;
          let clearHint: (() => void) | undefined;

          const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
            // canGoBack is the WebView's own history state and is the only
            // reliable "is there anywhere to go back to" signal here. The
            // previous check also accepted `window.history.length > 1`, but
            // history.length never shrinks as you navigate back — so once a
            // session had been more than one page deep, returning to the first
            // entry left canGoBack false and history.length still >1. Back then
            // called history.back() on an empty stack, which does nothing, and
            // the app could not be left with the back button at all.
            if (canGoBack) {
              window.history.back();
              return;
            }
            // At the root: require a confirming second press. A single stray
            // back gesture closing the app outright is the most common complaint
            // about WebView shells.
            const now = Date.now();
            if (now < armedUntil) {
              clearHint?.();
              void App.exitApp();
              return;
            }
            armedUntil = now + EXIT_CONFIRM_MS;
            clearHint = flashMessage("Press back again to exit");
          });
          teardown.push(() => {
            clearHint?.();
            return backHandle.remove();
          });
          if (disposed) return void dispose();
        }
      } catch {
        /* @capacitor/app unavailable — back button falls back to Capacitor's default */
      }

      // ---- Connectivity ----------------------------------------------------
      // A dead network mid-session is invisible otherwise: the current page
      // stays on screen and every tap just fails silently. (A failed *initial*
      // load is handled natively by server.errorPath → www/offline.html.)
      try {
        const { Network } = await import("@capacitor/network");
        if (disposed) return;
        let offlineHint: (() => void) | undefined;
        const netHandle = await Network.addListener("networkStatusChange", (status) => {
          if (status.connected) {
            root.classList.remove("is-offline");
            offlineHint?.();
            offlineHint = undefined;
          } else {
            root.classList.add("is-offline");
            offlineHint?.();
            offlineHint = flashMessage("You're offline — prices may be out of date", 6000);
          }
        });
        teardown.push(() => {
          offlineHint?.();
          return netHandle.remove();
        });
        if (disposed) return void dispose();
      } catch {
        /* network plugin unavailable — non-fatal */
      }

      // ---- Keyboard --------------------------------------------------------
      // The banner is pinned to the bottom of the window, which is exactly where
      // the keyboard appears. Leaving it there puts an ad between the user and
      // the search field they are typing into — and AdMob counts taps on it.
      let setBannerVisible: ((visible: boolean) => void) | undefined;
      try {
        const { Keyboard } = await import("@capacitor/keyboard");
        if (disposed) return;
        const showH = await Keyboard.addListener("keyboardWillShow", () => {
          root.classList.add("keyboard-open");
          setBannerVisible?.(false);
        });
        const hideH = await Keyboard.addListener("keyboardWillHide", () => {
          root.classList.remove("keyboard-open");
          setBannerVisible?.(true);
        });
        teardown.push(() => showH.remove());
        teardown.push(() => hideH.remove());
        if (disposed) return void dispose();
      } catch {
        /* keyboard plugin unavailable — non-fatal */
      }

      // ---- AdMob -----------------------------------------------------------
      try {
        const admob = await import("@capacitor-community/admob");
        if (disposed) return;
        const { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents } = admob;
        const live = adsAreLive(platform);

        // iOS: ask for tracking permission before the SDK reads the IDFA.
        // Declining is fine — the SDK falls back to non-personalised ads.
        try {
          if (platform === "ios") await AdMob.requestTrackingAuthorization();
        } catch {
          /* ATT unavailable (e.g. older iOS) — continue non-personalised */
        }
        if (disposed) return;

        // The plugin reports the banner's true height here. ADAPTIVE_BANNER
        // sizes itself from the screen width and re-reports on rotation, so the
        // layout variable is driven from this rather than a constant.
        const sizeHandle = await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
          const h = Math.max(0, Math.round(size?.height ?? 0));
          root.style.setProperty("--native-banner-h", `${h}px`);
          root.classList.toggle("has-native-banner", h > 0);
        });
        teardown.push(() => sizeHandle.remove());
        if (disposed) return void dispose();

        await AdMob.initialize({ initializeForTesting: !live, testingDevices: [] });
        if (disposed) return void dispose();

        await AdMob.showBanner({
          adId: bannerAdId(platform),
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: !live,
        });
        // The banner is a real native view sitting over the WebView; it outlives
        // this component unless it is explicitly destroyed, so a remount without
        // this would stack a second banner on the first.
        teardown.push(async () => {
          root.classList.remove("has-native-banner");
          root.style.removeProperty("--native-banner-h");
          await AdMob.removeBanner();
        });
        if (disposed) return void dispose();

        setBannerVisible = (visible: boolean) => {
          void (visible ? AdMob.resumeBanner() : AdMob.hideBanner()).catch(() => {
            /* banner already gone */
          });
        };

        root.classList.add("has-native-banner");
      } catch (err) {
        // Ads and native niceties must never break the actual app.
        // eslint-disable-next-line no-console
        console.warn("[RiftCompare] native shell init failed", err);
      }

      if (disposed) void dispose();
    })();

    return () => {
      void dispose();
    };
  }, [router]);

  return null;
}
