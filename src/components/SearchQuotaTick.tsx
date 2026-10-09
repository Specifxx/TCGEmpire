"use client";

import { useEffect } from "react";

// Counts a /browse text search against the day's allowance (lib/search-quota.ts).
// The page itself decides whether the search is refused, but a server component
// cannot set the counter cookie, so this posts the query once on mount. A query
// the typeahead already counted (or an extension of it) costs nothing.
export function SearchQuotaTick({ q }: { q: string }) {
  useEffect(() => {
    fetch("/api/search/quota", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
      keepalive: true,
    }).catch(() => {});
  }, [q]);
  return null;
}
