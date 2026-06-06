"use client";

import { useEffect, useState } from "react";
import { useWishlistDrawer } from "./WishlistDrawer";
import { wishlistCount } from "@/lib/wishlist-client";

export function NavWishlistButton() {
  const { open } = useWishlistDrawer();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(wishlistCount());
    sync();
    window.addEventListener("wishlist-change", sync);
    return () => window.removeEventListener("wishlist-change", sync);
  }, []);

  return (
    <button
      onClick={open}
      aria-label="Open wishlist"
      className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-ink-800 hover:text-white"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2 5 5.2 5c1.9 0 3.2 1 3.8 2.2C9.6 6 11 5 12.8 5 16 5 17.6 8.4 16 11.8 13.5 16.4 12 21 12 21z" />
      </svg>
      <span className="hidden sm:inline">Wishlist</span>
      {count > 0 && (
        <span className="ml-0.5 grid min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}
