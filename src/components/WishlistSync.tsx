"use client";

import { useEffect, useRef } from "react";
import { getWishlist, setWishlist } from "@/lib/wishlist-client";

// Keeps a signed-in user's wishlist saved to their account (cross-device). On mount
// it merges the server-saved list with the cookie list (union) and writes the merged
// set to both. Thereafter it debounce-saves every change to the server. Logged-out
// users are untouched (cookie only). Renders nothing.
export function WishlistSync({ loggedIn }: { loggedIn: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;

    const save = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        fetch("/api/wishlist", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: getWishlist() }),
        }).catch(() => {});
      }, 800);
    };

    // Merge server + cookie on sign-in, then persist the union both ways.
    (async () => {
      try {
        const res = await fetch("/api/wishlist");
        const data = await res.json();
        if (cancelled) return;
        const merged = Array.from(new Set([...(data.ids ?? []), ...getWishlist()]));
        setWishlist(merged); // updates the cookie + notifies buttons
        save(); // push the merged set to the server
      } catch {
        /* ignore — cookie wishlist still works */
      }
    })();

    const onChange = () => save();
    window.addEventListener("wishlist-change", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("wishlist-change", onChange);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loggedIn]);

  return null;
}
