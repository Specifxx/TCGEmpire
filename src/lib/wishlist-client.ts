"use client";

// Cookie-backed wishlist so it works without an account and is readable by the
// server (the /wishlist page). When Google/Discord sign-in is added, this can be
// migrated to a per-user DB table.
const KEY = "rea_wishlist";

export function getWishlist(): string[] {
  if (typeof document === "undefined") return [];
  const match = document.cookie.split("; ").find((c) => c.startsWith(KEY + "="));
  if (!match) return [];
  return decodeURIComponent(match.split("=")[1] ?? "").split(",").filter(Boolean);
}

function save(ids: string[]) {
  document.cookie = `${KEY}=${encodeURIComponent(ids.join(","))}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  window.dispatchEvent(new CustomEvent("wishlist-change"));
}

export function isWishlisted(id: string): boolean {
  return getWishlist().includes(id);
}

export function toggleWishlist(id: string): boolean {
  const ids = getWishlist();
  const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);
  else ids.unshift(id);
  save(ids);
  return ids.includes(id);
}

export function wishlistCount(): number {
  return getWishlist().length;
}
