"use client";

import { useEffect, useState } from "react";

// The Android app's native side, reached through the runtime the app itself injects (window.Capacitor), never through npm
// packages: the website and the installed app ship separately, so the plugin JavaScript must be the app's own version, not one
// bundled here (the old @capacitor/* v6 imports ran against the app's v8 runtime). On the plain web every helper is a no-op.

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; registerPlugin?: (n: string) => any; Plugins?: Record<string, any> };

function cap(): Cap | null {
  if (typeof window === "undefined") return null;
  const c = (window as any).Capacitor as Cap | undefined;
  return c?.isNativePlatform?.() ? c : null;
}

export function isNativeApp(): boolean {
  return cap() !== null;
}

export function nativePlatform(): "android" | "ios" | null {
  const c = cap();
  return c ? (c.getPlatform?.() === "ios" ? "ios" : "android") : null;
}

const plugins = new Map<string, any>();
/** A native plugin of the installed app, or null (not in the app, or that build lacks it). */
export function plugin(name: string): any | null {
  const c = cap();
  if (!c) return null;
  if (plugins.has(name)) return plugins.get(name);
  let p: any = c.Plugins?.[name] ?? null;
  if (!p && c.registerPlugin) {
    try {
      p = c.registerPlugin(name);
    } catch {
      p = null;
    }
  }
  plugins.set(name, p);
  return p;
}

/** Opens a page outside the app (a Chrome Custom Tab). False when not in the app or it failed, so the caller does its web thing. */
export async function openExternal(url: string): Promise<boolean> {
  const browser = plugin("Browser");
  if (!browser) return false;
  try {
    await browser.open({ url });
    return true;
  } catch {
    return false;
  }
}

// ---- Sign-in from inside the app (lib/app-auth.ts has the whole round trip) ----

const VERIFIER_KEY = "rc_app_auth_verifier";

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readAppVerifier(): string | null {
  try {
    return localStorage.getItem(VERIFIER_KEY);
  } catch {
    return null;
  }
}

export function clearAppVerifier(): void {
  try {
    localStorage.removeItem(VERIFIER_KEY);
  } catch {
    /* fine */
  }
}

/**
 * "Continue with Google/Discord" inside the app: Google refuses sign-in in a WebView, so the provider opens in a Custom Tab and
 * the app gets a one-time code back. Resolves false when this cannot run (not the app, no crypto, a network error); the caller
 * then lets the plain link go ahead.
 */
export async function startAppOAuth(href: string): Promise<boolean> {
  if (!isNativeApp() || !window.crypto?.subtle) return false;
  try {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const verifier = b64url(raw);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    localStorage.setItem(VERIFIER_KEY, verifier);
    const u = new URL(href, location.origin);
    u.searchParams.set("app", challenge);
    u.searchParams.set("json", "1");
    const res = await fetch(u.pathname + u.search, { credentials: "same-origin" });
    if (!res.ok) return false;
    const { url } = (await res.json()) as { url?: string };
    if (!url || !/^https:\/\//.test(url)) return false;
    return openExternal(url);
  } catch {
    return false;
  }
}

/** True inside the app, after mount (false on the server and on the web, so the first render always matches the HTML). */
export function useIsNativeApp(): boolean {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isNativeApp()), []);
  return inApp;
}
