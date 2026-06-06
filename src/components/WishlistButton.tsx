"use client";

import { useEffect, useState } from "react";
import { isWishlisted, toggleWishlist } from "@/lib/wishlist-client";

export function WishlistButton({
  cardId,
  variant = "icon",
}: {
  cardId: string;
  variant?: "icon" | "full";
}) {
  const [on, setOn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOn(isWishlisted(cardId));
    const h = () => setOn(isWishlisted(cardId));
    window.addEventListener("wishlist-change", h);
    return () => window.removeEventListener("wishlist-change", h);
  }, [cardId]);

  function click(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOn(toggleWishlist(cardId));
  }

  const heart = (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
      <path d="M12 21s-7.5-4.6-10-9.2C.4 8.4 2 5 5.2 5c1.9 0 3.2 1 3.8 2.2C9.6 6 11 5 12.8 5 16 5 17.6 8.4 16 11.8 13.5 16.4 12 21 12 21z" />
    </svg>
  );

  if (variant === "full") {
    return (
      <button
        onClick={click}
        className={`btn ${on ? "bg-gold/20 text-gold" : "bg-ink-800 text-slate-200 hover:bg-ink-700"}`}
      >
        {heart}
        {mounted && on ? "In wishlist" : "Add to wishlist"}
      </button>
    );
  }

  return (
    <button
      onClick={click}
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      title={on ? "Remove from wishlist" : "Add to wishlist"}
      className={`grid h-8 w-8 place-items-center rounded-full border transition-colors ${
        on
          ? "border-gold/50 bg-gold/20 text-gold"
          : "border-ink-600 bg-ink-950/80 text-slate-300 hover:text-gold"
      }`}
    >
      {heart}
    </button>
  );
}
