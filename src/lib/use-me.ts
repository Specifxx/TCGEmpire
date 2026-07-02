"use client";

import { useEffect, useState } from "react";
import type { MenuUser } from "@/components/UserMenu";

// Client-side session hook. One /api/me fetch per page load, shared by every
// consumer (NavUser, PremiumProvider) via a module-level promise cache — the
// chrome renders session-less on the server (so pages can be cached/ISR) and
// hydrates the signed-in state from here.
export interface Me {
  user: MenuUser | null;
  premium: boolean;
}

let mePromise: Promise<Me> | null = null;

function fetchMe(): Promise<Me> {
  if (!mePromise) {
    mePromise = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null, premium: false }))
      .then((d) => ({ user: d.user ?? null, premium: !!d.premium }))
      .catch(() => ({ user: null, premium: false }));
  }
  return mePromise;
}

// Re-fetch on next use (e.g. after login/logout navigation re-mounts the chrome).
export function invalidateMe() {
  mePromise = null;
}

export function useMe(): { user: MenuUser | null; premium: boolean; loaded: boolean } {
  const [state, setState] = useState<{ user: MenuUser | null; premium: boolean; loaded: boolean }>({
    user: null,
    premium: false,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled) setState({ ...me, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
