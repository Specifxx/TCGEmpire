// "THIS TAB HAS ALREADY STARTED SIGNING IN" (2026-09-29, DECISIONS.md "Nudges:
// value first"). Someone who opened /login or clicked a sign-in link and came
// back is not a stranger the sign-up card should introduce the idea to; asking
// again is the exact repeat-ask a visitor's "not yet" is supposed to stop.
//
// One sessionStorage flag, set from the places that already exist:
//   • any click on a link into /login, /register or the OAuth start routes
//     (the header, the drawers, every tool gate: they all carry ?src=
//     attribution and are plain anchors, so one document-level listener covers
//     them without touching a single call site);
//   • a visit to /login or /verify itself (a router.push from a button lands
//     there, and so does a typed URL).
// sessionStorage, so it ends with the tab like the rest of a "visit".

const KEY = "rc_signin_started";

/** Is this href one that starts sign-in? Relative or absolute, any query. */
export function isSignInHref(href: string | null | undefined, origin?: string): boolean {
  if (!href) return false;
  try {
    const u = new URL(href, origin ?? "https://x.invalid");
    if (origin && u.origin !== origin) return false;
    return /^\/(login|register)(\/|$)/.test(u.pathname) || u.pathname.startsWith("/api/auth/");
  } catch {
    return false;
  }
}

/** Is this a page that IS the sign-in flow? */
export function isSignInPath(pathname: string | null | undefined): boolean {
  return !!pathname && /^\/(login|verify|register)(\/|$)/.test(pathname);
}

export function markSignInStarted(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode: the /login page itself is still skipped by every nudge */
  }
}

export function signInStarted(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Install the document-level click listener; returns its cleanup. */
export function watchSignInClicks(): () => void {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (a && isSignInHref(a.getAttribute("href"), window.location.origin)) markSignInStarted();
  };
  document.addEventListener("click", onClick, { capture: true, passive: true });
  return () => document.removeEventListener("click", onClick, { capture: true });
}
