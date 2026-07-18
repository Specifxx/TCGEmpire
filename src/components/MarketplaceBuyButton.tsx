"use client";

import { useState } from "react";
import { MarketplaceCheckout, type CheckoutItem } from "./MarketplaceCheckout";

// Single-listing "Buy now" — opens the shipping-address + estimate step inline
// (same flow as the cart's Checkout button), then hands off to Stripe. Needs the
// full item shape (not just a listingId) since the checkout step displays it.
export function MarketplaceBuyButton({ item, label = "Buy now" }: { item: CheckoutItem; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)} className="btn-primary w-full text-xs">
        {label}
      </button>
      {open && <MarketplaceCheckout items={[item]} onClose={() => setOpen(false)} />}
    </div>
  );
}
