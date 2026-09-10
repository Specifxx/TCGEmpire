"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { firePremiumClickBeacon } from "@/lib/analytics";

// Fires the Premium-interest beacon with source="recovery" when a visitor
// lands on /premium via the checkout-recovery email's link (?src=recovery —
// see sendCheckoutRecoveryEmail in lib/email.ts), so /admin/premium can show
// recovery email → renewed interest, the same way "Started checkout" already
// tracks the original click. Fires once, then strips the param via
// router.replace so a refresh/bookmark of the landing page can't re-fire it —
// same pattern as SignupWelcome.tsx's ?welcome= handling.
//
// Self-wrapped in <Suspense> because useSearchParams requires a boundary in
// the app router; renders nothing either way, so mounting it on /premium adds
// no visible UI and never touches server-rendered HTML (query params never
// enter cached HTML, so this is ISR-safe).
function PremiumRecoveryBeaconInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    // Two email campaigns land here with their own ?src= so the admin can tell
    // them apart: the abandoned-checkout recovery email and the one-off Premium
    // offer email (lib/premium-offer.ts). Anything else is not ours to count.
    const src = searchParams?.get("src");
    if (fired.current) return;
    if (src === "recovery") firePremiumClickBeacon("recovery");
    else if (src === "offer") firePremiumClickBeacon("offer");
    else return;
    fired.current = true;
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("src");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname ?? "/premium", { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}

export function PremiumRecoveryBeacon() {
  return (
    <Suspense fallback={null}>
      <PremiumRecoveryBeaconInner />
    </Suspense>
  );
}
