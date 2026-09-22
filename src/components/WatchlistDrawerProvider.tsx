"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { WatchlistDrawer } from "./WatchlistDrawer";

// Shared open/close state for the watchlist side drawer.
//
// WHY A DRAWER, NOT A ROUTE (2026-09-22, owner: "the watchlist button should
// open a side tab not go to a separate page"). HeaderWatchButton used to be a
// plain <Link href="/watching">, matching the deleted bottom bar's Watch tab.
// A full navigation is the wrong weight for "check what I'm tracking and get
// back to what I was doing" — it drops whatever the visitor was browsing
// (browse filters, a card page's scroll position) for a page whose only job
// is a grid of the same CardTiles. A drawer keeps the page underneath intact.
//
// /watching ITSELF STAYS. It is the deep-link target (bookmarks, the login
// redirect's `?next=/watching`, anything crawled despite noindex) and is
// already `force-dynamic` for the same session read the drawer's own fetch
// needs — deleting it would break every existing link for no gain. The
// drawer's <Watchlist> is the exact same component that page renders.
const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function useWatchlistDrawer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWatchlistDrawer must be used within <WatchlistDrawerProvider>");
  return c;
}

export function WatchlistDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, setOpen }}>
      {children}
      <WatchlistDrawer />
    </Ctx.Provider>
  );
}
