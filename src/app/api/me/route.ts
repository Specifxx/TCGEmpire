import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled, PREMIUM_TRIAL_DAYS } from "@/lib/premium";

// Session endpoint for the client-side chrome (UserMenu, wishlist sync,
// premium ad-hiding).
//
// WHY THIS EXISTS: the root layout and Navbar used to call getCurrentUser()
// during the server render, and that cookies() read forced EVERY route to
// render per-request — killing ISR site-wide. The chrome now renders
// session-less (cacheable) HTML and the client fetches the session from here
// after mount.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    {
      user: user
        ? {
            displayName: user.displayName,
            email: user.email,
            avatarUrl: user.avatarUrl ?? null,
            emailVerified: !!user.emailVerified,
            balanceCents: user.balanceCents,
            points: user.points,
            canCheckIn: user.canCheckIn,
          }
        : null,
      premium: isPremium(user),
      // Premium upsell state for the client (the one-click Premium dialog).
      premiumCheckout: premiumCheckoutEnabled(),
      trialEligible: !!user && !isPremium(user) && premiumTrialEnabled() && !user.trialStartedAt,
      trialDays: PREMIUM_TRIAL_DAYS,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
