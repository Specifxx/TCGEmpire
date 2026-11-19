"use client";

import { useEffect } from "react";
import { isNativeApp, nativePlatform, openExternal, plugin, startAppOAuth } from "@/lib/native";

// Bridges the website to the Android app (a Capacitor WebView of this site; mobile/README.md). On the plain web it does nothing.
//
// In the app (2026-11-19, DECISIONS.md "The Android app matches the phone site"):
// - tags <html> with `capacitor-native` (globals.css hides what makes no sense in the app: buying Premium, the app's own promo);
// - the bottom nav and the phone ad strip show exactly as on the phone site (they used to be switched off for the native AdMob
//   banner, which ran on Google's TEST ids and earned nothing: it is gone, and any banner an older page put up is taken down);
// - "Continue with Google/Discord" runs in a Custom Tab and comes back signed in (lib/app-auth.ts), since Google refuses
//   sign-in inside a WebView;
// - links that open the app (an App Link such as an emailed sign-in link, a launcher shortcut, the sign-in's return) land on
//   the right page;
// - links to other sites open in a Custom Tab over the app; the hardware back button goes back, and leaves the app at the start.
//
// Every plugin is the installed app's own (lib/native.ts), so a website release never needs a new app build.
export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.classList.add("capacitor-native", `capacitor-${nativePlatform()}`);
    const cleanups: Array<() => void> = [];

    // A banner from the old AdMob layer outlives a page load inside the native view: take it down.
    const admob = plugin("AdMob");
    if (admob) void Promise.resolve(admob.removeBanner?.()).catch(() => {});
    root.classList.remove("has-native-banner");

    const statusBar = plugin("StatusBar");
    if (statusBar) {
      void Promise.resolve(statusBar.setStyle?.({ style: "DARK" })).catch(() => {});
      void Promise.resolve(statusBar.setBackgroundColor?.({ color: "#0a0f1a" })).catch(() => {});
    }

    const app = plugin("App");
    const browser = plugin("Browser");

    // A URL that opened the app: our own return scheme (sign-in) or a riftcompare.com page.
    const route = (raw: string | undefined) => {
      if (!raw) return;
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        return;
      }
      if (u.protocol === "com.riftcompare.app:") {
        void Promise.resolve(browser?.close?.()).catch(() => {});
        const q = new URLSearchParams(u.search);
        const code = q.get("code");
        const error = q.get("error");
        if (code) {
          const next = q.get("n");
          window.location.assign(`/login/app?${new URLSearchParams({ code, ...(next ? { n: next } : {}) })}`);
        } else if (error) {
          window.location.assign(`/login?${new URLSearchParams({ error })}`);
        }
        return;
      }
      if (u.protocol === "https:" && (u.hostname === "riftcompare.com" || u.hostname === "www.riftcompare.com")) {
        const path = `${u.pathname}${u.search}${u.hash}`;
        if (path !== `${location.pathname}${location.search}${location.hash}`) window.location.assign(path);
      }
    };

    if (app) {
      void Promise.resolve(app.addListener?.("appUrlOpen", (ev: { url?: string }) => route(ev?.url)))
        .then((h) => h && cleanups.push(() => void h.remove?.()))
        .catch(() => {});
      // A cold start from a link: handle it once per launch, not on every page load after it.
      try {
        if (!sessionStorage.getItem("rc_app_launch_routed")) {
          sessionStorage.setItem("rc_app_launch_routed", "1");
          void Promise.resolve(app.getLaunchUrl?.())
            .then((r: { url?: string } | undefined) => route(r?.url))
            .catch(() => {});
        }
      } catch {
        /* no sessionStorage: skip */
      }
      // Back goes back within the app and leaves it at the start. `canGoBack` is the WebView's own history
      // (window.history.length never shrinks, so it cannot tell).
      void Promise.resolve(
        app.addListener?.("backButton", (ev: { canGoBack?: boolean }) => {
          if (ev?.canGoBack) window.history.back();
          else void app.exitApp?.();
        }),
      )
        .then((h) => h && cleanups.push(() => void h.remove?.()))
        .catch(() => {});
    }

    // Sign-in buttons are plain links to /api/auth/oauth/<provider>. Capture phase, so it runs before the page's own handlers
    // (which still run: they only count the click).
    const onSignIn = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin || !/^\/api\/auth\/oauth\/(google|discord)$/.test(u.pathname)) return;
      e.preventDefault();
      void startAppOAuth(u.pathname + u.search).then((ok) => {
        if (!ok) window.location.assign(u.pathname + u.search);
      });
    };
    // Any other link to another site that nothing else handled (OutboundLink does its own): a Custom Tab over the app.
    // Bubble phase, after the page's handlers, so a link that already took care of itself is left alone.
    const onExternal = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || e.defaultPrevented || e.button !== 0) return;
      let u: URL;
      try {
        u = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") return; // mailto:, tel:, intents: the system handles them
      if (u.hostname === location.hostname) return;
      e.preventDefault();
      void openExternal(u.toString()).then((ok) => {
        if (!ok) window.location.href = u.toString();
      });
    };
    document.addEventListener("click", onSignIn, true);
    document.addEventListener("click", onExternal);
    cleanups.push(() => document.removeEventListener("click", onSignIn, true));
    cleanups.push(() => document.removeEventListener("click", onExternal));

    return () => cleanups.forEach((f) => f());
  }, []);

  return null;
}
