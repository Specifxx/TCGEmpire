// How the WEBSITE recognises that it is running inside the native app, before
// any JavaScript bundle has loaded — and what it does about the ad stack.
//
// Shared by the root layout (which inlines NATIVE_BOOT_SCRIPT in <head>),
// mobile/capacitor.config.ts (which appends NATIVE_UA_TOKEN to the WebView's
// User-Agent) and tests/native-boot.test.ts. No React, no DOM at module level.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// Google AdSense and Google AdMob are different products with different rules.
// AdSense is for web pages viewed in a browser; the Google Publisher Policies
// put app inventory — including a WebView wrapping your own site — under AdMob
// instead. RiftCompare's native shell (mobile/) shows a native AdMob banner,
// and the site it loads was ALSO serving AdSense: the loader in <head>, Auto
// ads, and every AdSlot unit, none of which were gated on the native runtime.
// (README.md and NativeShell.tsx both claimed globals.css suppressed web ads
// in-app; no such rule existed.) That is two ad stacks in one app and an
// AdSense policy problem, so the app now suppresses the AdSense half.
//
// ── Why the User-Agent, and not window.Capacitor ─────────────────────────────
// The bridge global is injected by the native layer and is NOT guaranteed to
// exist before the page's own head scripts run when the WebView is loading a
// REMOTE url (server.url), which is exactly our setup. navigator.userAgent is
// available on the first line of the first script, every time.
//
// ── Why the User-Agent, and not a server-side header check ───────────────────
// Reading headers() in the root layout would opt EVERY route out of static
// rendering — the same constraint that already forces the sidenav and theme
// boot scripts (see lib/sidenav-shared.ts). This has to be decided on the
// client, from static HTML that stays cacheable.

/** Appended to the native WebView's User-Agent by mobile/capacitor.config.ts. */
export const NATIVE_UA_TOKEN = "RiftCompareApp";

/** Set on <html> the moment the boot script runs, for CSS that must not wait
 *  for hydration. NativeShell.tsx adds the same class again (harmlessly) once
 *  the bundle is up, for the cases the UA sniff can't cover. */
export const NATIVE_HTML_CLASS = "capacitor-native";

/**
 * Inlined in <head> by the root layout, BEFORE <AdSenseLoader />.
 *
 * `pauseAdRequests` is AdSense's own documented switch for "load the library
 * but do not fetch ads yet"; setting it on the queue object before the loader
 * executes stops Auto ads placing anything, without removing the loader tag.
 * Keeping the tag matters: it is also the site-ownership verification and the
 * EEA/UK/CH consent-message transport, which is why AdSenseLoader.tsx says it
 * must never be gated. It is gated here only for the app's own WebView, and
 * only at the request level.
 *
 * Ordering note: React 18 hoists `<script async src>` into the head preamble,
 * so the AdSense loader TAG is emitted ahead of this inline script in the byte
 * stream. That is fine — the loader is async and cross-origin, so it cannot
 * execute until a fresh connection to pagead2.googlesyndication.com completes,
 * while this runs the microsecond the parser reaches it. Same reasoning, and
 * the same measured margin, as the Consent Mode defaults described in
 * AdSenseLoader.tsx.
 *
 * Plain ES5, wrapped in try/catch, so an old WebView cannot break the page.
 */
export const NATIVE_BOOT_SCRIPT: string = [
  "(function(){try{",
  `if(navigator.userAgent.indexOf(${JSON.stringify(NATIVE_UA_TOKEN)})<0)return;`,
  `document.documentElement.classList.add(${JSON.stringify(NATIVE_HTML_CLASS)});`,
  "(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;",
  "}catch(e){}})();",
].join("");

/** True inside the native app's WebView. Safe during SSR (returns false).
 *  Used by client components that must not render an AdSense unit in-app. */
export function isNativeUserAgent(ua?: string): boolean {
  const s = ua ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  return s.indexOf(NATIVE_UA_TOKEN) >= 0;
}
