"use client";

import { useEffect, useState } from "react";

// Shared client-side view of "how many unread notifications do I have?".
// MODULE-LEVEL, like use-watchlist.ts and use-me.ts, and for the same reason:
// NotificationBell polls this every 60s, and WelcomeBack wants the same
// number on the homepage — two pollers would mean two requests on every page
// that renders both. One shared interval, any number of readers.

let count = 0;
let polling = false;
const subscribers = new Set<(n: number) => void>();

function publish() {
  for (const fn of subscribers) fn(count);
}

async function refresh() {
  try {
    const res = await fetch("/api/notifications/unread-count");
    if (res.ok) {
      count = (await res.json()).unreadCount ?? 0;
      publish();
    }
  } catch {
    /* best-effort — try again next poll */
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  void refresh();
  setInterval(refresh, 60_000);
}

/** Re-fetch on next use — call beside invalidateMe() on login/logout. */
export function invalidateUnread() {
  count = 0;
  publish();
  void refresh();
}

// Optimistic local writes, so a mark-read/mark-all-read inside the bell's own
// dropdown (or the authoritative count that comes back with the full feed on
// open) updates every reader immediately, not just on the next 60s poll.
export function setUnreadCount(n: number) {
  count = n;
  publish();
}
export function bumpUnreadCount(delta: number) {
  count = Math.max(0, count + delta);
  publish();
}

export function useUnreadCount(): number {
  const [n, setN] = useState(count);
  useEffect(() => {
    subscribers.add(setN);
    startPolling();
    return () => {
      subscribers.delete(setN);
    };
  }, []);
  return n;
}
