import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { analyticsUserId } from "@/lib/ga-user-id";
import { enabledProviders } from "@/lib/oauth";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled, premiumAnnualEnabled, premiumPlusEnabled, plusAnnualEnabled, premiumTierOf, PREMIUM_TRIAL_DAYS, introEligibleFor } from "@/lib/premium";
import { billingStateFor } from "@/lib/billing-state";

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
  // Trial / billing interval of a PLUS viewer's own subscription — one
  // memoised, time-boxed Stripe read per customer (lib/billing-state.ts). Only
  // the Plus → Premium upgrade offers read these, so Premium, free and
  // signed-out viewers cost no Stripe call and never wait on one for adFree.
  const billing = await billingStateFor(user, premiumTierOf(user) === "plus");
  return NextResponse.json(
    {
      user: user
        ? {
            displayName: user.displayName,
            email: user.email,
            avatarUrl: user.avatarUrl ?? null,
            emailVerified: !!user.emailVerified,
            balanceCents: user.balanceCents,
            preferredCountry: user.preferredCountry,
          }
        : null,
      // GA4 User-ID (components/GoogleAnalyticsUser.tsx). Hashed here rather than
      // sent raw so User.id stays server-side — see lib/ga-user-id.ts. Null when
      // signed out, which is what clears the id on the client.
      analyticsId: user ? analyticsUserId(user.id) : null,
      premium: isPremium(user),
      // Whether to hide ads. Every paid tier is ad-free again (owner's call,
      // 2026-09-25 — DECISIONS.md, "Plus is ad-free again"); it was
      // Premium-only from 2026-09-14. Kept as its own flag so the tier line
      // can move again without touching every ad placement.
      adFree: isPremium(user),
      // Which paid tier ("plus" | "premium"), or null if not entitled at all —
      // for surfaces that need to NAME the tier rather than just gate on it.
      tier: premiumTierOf(user),
      // Mid-trial, a plan switch isn't offered (the switch routes handle paid
      // subscriptions only), and an upgrade quote uses the subscriber's own
      // billing interval — annual subscribers stay annual. Plus viewers only;
      // false / null for everyone else.
      trialing: billing.trialing,
      interval: billing.interval,
      // Premium upsell state for the client (the one-click Premium dialog).
      premiumCheckout: premiumCheckoutEnabled(),
      // Whether the cheaper Plus tier is configured at all (dark until its
      // Stripe price ids are set) — sibling of premiumAnnual below.
      premiumPlus: premiumPlusEnabled(),
      trialEligible: !!user && !isPremium(user) && premiumTrialEnabled() && !user.trialStartedAt,
      trialDays: PREMIUM_TRIAL_DAYS,
      // Would checkout give this viewer the half-price first months (monthly
      // plans)? Same never-paid rule as checkout; false for current payers.
      introEligible: !isPremium(user) && (await introEligibleFor(user)),
      premiumAnnual: premiumAnnualEnabled(),
      plusAnnual: plusAnnualEnabled(),
      // Which OAuth buttons to render. Env-derived, no session in it — here so a
      // CLIENT component can show the sign-in form without being handed the list
      // as a prop: PremiumDialog embeds AuthForm for signed-out visitors, and it
      // is mounted by PremiumDialogProvider, which the root layout renders as a
      // bare literal (pinned by tests/premium-slidein.test.ts) with nowhere to
      // thread a prop through. SignupPromoPopup and PriceAlertModal still take
      // theirs from the layout; unify later, not in this pass.
      providers: enabledProviders(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
