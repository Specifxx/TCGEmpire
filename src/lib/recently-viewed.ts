"use client";

import { useSyncExternalStore } from "react";

// Client-only "cards you've looked at" — no server read, no account required.
// Written from CardViewBeacon (the card page) and QuickView.open() (every tile
// site-wide), both of which already have the seven fields below on hand.
const KEY = "rc_recent_cards";
const EVENT = "rc:recent-cards";
const MAX = 12;

export interface RecentCardEntry {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  // Already resolved through lib/card-image-url.ts's cardImageSrc() by both
  // writers — never a raw DB imageUrl/imageThumbUrl column. See that file's
  // own comment for why: this codebase has already had one outage from a
  // dead CDN path cached straight out of the database.
  imageSrc: string | null;
}

function readRaw(): RecentCardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as RecentCardEntry[]) : [];
  } catch {
    return [];
  }
}

export function readRecentCards(): RecentCardEntry[] {
  return readRaw();
}

// Dedupe by id (a re-view moves the card back to the front) and cap at MAX,
// most-recent first. Best-effort: a full or disabled localStorage just means
// no rail, never a thrown error on the card page itself.
export function pushRecentCard(entry: RecentCardEntry): void {
  if (typeof window === "undefined") return;
  try {
    const next = [entry, ...readRaw().filter((c) => c.id !== entry.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full/unavailable — recently-viewed is a nice-to-have, not core */
  }
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  // "storage" fires cross-tab; the custom event fires same-tab (the browser
  // never dispatches "storage" back to the tab that wrote the key).
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

// Cached by the raw string so getSnapshot returns a stable reference between
// calls when nothing changed — useSyncExternalStore re-renders on any
// snapshot that isn't reference-equal to the last one.
let cachedRaw: string | null | undefined;
let cached: RecentCardEntry[] = [];
function getSnapshot(): RecentCardEntry[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = readRaw();
  }
  return cached;
}
function getServerSnapshot(): RecentCardEntry[] {
  return [];
}

export function useRecentCards(): RecentCardEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
