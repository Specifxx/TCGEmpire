"use client";

// THE BROWSER HALF OF THE CORNER NUDGES' MANNERS. lib/nudge-gate.ts decides
// WHO may be asked and WHEN in the visit; this file decides whether THIS
// MOMENT is a decent one, and owns the timer that waits for it.
// DECISIONS.md, "Nudges: value first", 2026-09-29.
//
// Two things, shared by PremiumSlideIn and AnnualSwitchNudge so they cannot
// drift into two different sets of manners (the signed-out SignupPromoPopup
// used them too until it was removed on 2026-09-30, and took its engaged-time
// clock with it):
//   • armNudge     the show timer. Cancelled the moment the visitor opens a
//                  dialog or drawer or puts the cursor in a text field, restarted
//                  when they are done, and re-checked when it fires so a visitor
//                  who started scrolling fast or typing during the wait is not
//                  interrupted.
//   • useSessionViews  distinct page views this visit (tab), reloads not counted.

import { useEffect, useState } from "react";
import { isTextEntry, quietWaitMs, type QuietInput } from "./nudge-gate";

// ── Shared watchers, installed once per page load ───────────────────────────

let watching = false;
let dialogOpen = false;
let lastDialogClosedAt = -Infinity;
let lastScrollAt = -Infinity;
let lastKeyAt = -Infinity;
const dialogListeners = new Set<(open: boolean) => void>();

const dialogFlag = () => document.body.dataset.rcDialog === "1";

function ensureWatchers(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  dialogOpen = dialogFlag();
  new MutationObserver(() => {
    const open = dialogFlag();
    if (open === dialogOpen) return;
    dialogOpen = open;
    if (!open) lastDialogClosedAt = Date.now();
    dialogListeners.forEach((fn) => fn(open));
  }).observe(document.body, { attributes: true, attributeFilter: ["data-rc-dialog"] });
  window.addEventListener("scroll", () => (lastScrollAt = Date.now()), { passive: true, capture: true });
  document.addEventListener("keydown", () => (lastKeyAt = Date.now()), { passive: true, capture: true });
}

function readQuietInput(): QuietInput {
  const now = Date.now();
  return {
    dialogOpen: dialogFlag(),
    inputFocused: isTextEntry(document.activeElement as HTMLElement | null),
    sinceDialogClosedMs: now - lastDialogClosedAt,
    sinceScrollMs: now - lastScrollAt,
    sinceKeyMs: now - lastKeyAt,
  };
}

/**
 * Start a nudge's show timer; returns its cleanup. `onFire` runs once, after
 * `delayMs` and only at a quiet moment (nudge-gate.ts quietWaitMs).
 *
 * The timer is CANCELLED while a dialog/drawer is open or a text field has
 * focus, and restarted from the full delay when that ends; without that, a
 * nudge armed on page load lands on top of whatever the visitor opened in the
 * meantime. Cleanup (navigation, unmount) cancels it for good.
 */
export function armNudge({ delayMs, onFire }: { delayMs: number; onFire: () => void }): () => void {
  ensureWatchers();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (ms: number) => {
    clear();
    if (!done) timer = setTimeout(attempt, ms);
  };
  const busy = () => dialogFlag() || isTextEntry(document.activeElement as HTMLElement | null);
  const attempt = () => {
    timer = undefined;
    if (done) return;
    const wait = quietWaitMs(readQuietInput());
    if (wait > 0) return schedule(wait);
    done = true;
    onFire();
  };

  const onFocusIn = (e: FocusEvent) => {
    if (isTextEntry(e.target as HTMLElement | null)) clear();
  };
  // activeElement is still the old field during focusout; look one tick later.
  const onFocusOut = () =>
    setTimeout(() => {
      if (!done && timer === undefined && !busy()) schedule(delayMs);
    }, 0);
  const onDialog = (open: boolean) => {
    if (open) clear();
    else if (!done && !busy()) schedule(delayMs);
  };
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  dialogListeners.add(onDialog);
  if (!busy()) schedule(delayMs);

  return () => {
    done = true;
    clear();
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    dialogListeners.delete(onDialog);
  };
}

// ── Page views this visit ───────────────────────────────────────────────────

const memory = new Map<string, number>();

/**
 * Count `pathname` as a page view under `key` (sessionStorage, so a new tab is
 * a new visit) unless it is the page counted last: a reload or a re-render is
 * not a second page. Returns the running total.
 */
export function countSessionView(key: string, pathname: string): number {
  const lastKey = `${key}_last`;
  try {
    const n = Number(sessionStorage.getItem(key) ?? "0") || 0;
    if (sessionStorage.getItem(lastKey) === pathname) return n;
    sessionStorage.setItem(key, String(n + 1));
    sessionStorage.setItem(lastKey, pathname);
    return n + 1;
  } catch {
    // Storage blocked: count in memory, which still gets a single-page-app
    // visit right (it resets on a full reload, the safe direction: fewer asks).
    if (memoryLast.get(key) !== pathname) {
      memory.set(key, (memory.get(key) ?? 0) + 1);
      memoryLast.set(key, pathname);
    }
    return memory.get(key) ?? 0;
  }
}
const memoryLast = new Map<string, string>();

export function useSessionViews(key: string, pathname: string | null, enabled: boolean): number {
  // Returns 0 until THIS pathname is counted, so a render that sees a new path
  // never pairs it with the previous page's total.
  const [state, setState] = useState<{ path: string | null; views: number }>({ path: null, views: 0 });
  useEffect(() => {
    if (!enabled || !pathname) return;
    setState({ path: pathname, views: countSessionView(key, pathname) });
  }, [key, pathname, enabled]);
  return state.path === pathname ? state.views : 0;
}
