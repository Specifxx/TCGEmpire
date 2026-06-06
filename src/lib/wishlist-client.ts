"use client";

// Cookie-backed wishlist so it works without an account and is readable by the
// server (the /wishlist page). When Google/Discord sign-in is added, this can be
// migrated to a per-user DB table.
//
// Perf: the list is cached in memory so toggling doesn't re-parse the cookie, and
// the change event carries the affected id so only THAT button re-renders — not
// every wishlist button on the page (there can be hundreds with infinite scroll).
const KEY = "rea_wishlist";

let cache: string[] | null = null;

function load(): string[] {
  if (cache) return cache;
  if (typeof document === "undefined") return [];
  const match = document.cookie.split("; ").find((c) => c.startsWith(KEY + "="));
  cache = match ? decodeURIComponent(match.split("=")[1] ?? "").split(",").filter(Boolean) : [];
  return cache;
}

function persist() {
  document.cookie = `${KEY}=${encodeURIComponent((cache ?? []).join(","))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function getWishlist(): string[] {
  return load().slice();
}

export function isWishlisted(id: string): boolean {
  return load().includes(id);
}

export function toggleWishlist(id: string): boolean {
  const ids = load();
  const i = ids.indexOf(id);
  let nowOn: boolean;
  if (i >= 0) {
    ids.splice(i, 1);
    nowOn = false;
  } else {
    ids.unshift(id);
    nowOn = true;
  }
  persist();
  // Carry the changed id so listeners can skip work for unrelated cards.
  window.dispatchEvent(new CustomEvent("wishlist-change", { detail: { id } }));
  return nowOn;
}

export function wishlistCount(): number {
  return load().length;
}
