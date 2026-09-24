import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { CheckoutLauncher } from "@/components/CheckoutLauncher";
import { enabledProviders } from "@/lib/oauth";
import { isPremium, premiumCheckoutEnabled, premiumPlusEnabled, premiumTrialEnabled, PREMIUM_TRIAL_DAYS, hasEverPaid } from "@/lib/premium";
import { parseCheckoutSelection, parseStartSrc, sanitizeBackPath, PREMIUM_START_PATH } from "@/lib/premium-start";
import { TIER_NAMES, premiumZeroAmount, tierAnnualAmount, tierMonthlyAmount, PREMIUM_PRICE_PERIOD, introOfferEnabled, introPriceLine } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// SIGN-IN AS A STEP INSIDE CHECKOUT, NOT A GATE IN FRONT OF IT.
//
// Every "Get Plus/Premium" button lands here with the selection already made.
// Signed out, this page IS the sign-in step — the provider buttons render right
// here with ?next= pointing back at this same URL, so the OAuth round trip
// returns with the tier, plan and `back` intact and the launcher takes over. The
// old route (/login?next=/premium → sign in → hunt for the button again) cost
// five clicks from /premium and six from a tool blur-wall, and the blur-wall
// path dropped the page the visitor was actually reading. See DECISIONS.md,
// "Sign-in is a step inside checkout" (2026-09-13).
//
// This page never charges anything and never creates an account by itself: the
// OAuth callback remains the only way an email enters the User table.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Continue to checkout — RiftCompare Premium",
  description: "Sign in to continue to secure checkout for RiftCompare Premium.",
  // A transient funnel step, not a landing page: it has nothing to rank and its
  // ?tier=/?plan=/?back= combinations would be a small crawl trap. follow:true
  // so the links out of it (/premium, the page they came from) still carry.
  robots: { index: false, follow: true },
  alternates: pageAlternates(PREMIUM_START_PATH),
};

export default async function PremiumStartPage({
  searchParams,
}: {
  searchParams: { tier?: string; plan?: string; back?: string; src?: string };
}) {
  // Checkout unconfigured → /premium, which renders the honest waitlist CTA
  // instead of a buy button that can't work.
  if (!premiumCheckoutEnabled()) redirect("/premium");

  const { tier, plan } = parseCheckoutSelection(searchParams.tier, searchParams.plan, premiumPlusEnabled());
  const back = sanitizeBackPath(searchParams.back);
  const src = parseStartSrc(searchParams.src);

  const user = await getCurrentUser();

  // Already entitled (Premium, Plus, or an admin) → /premium. A Plus member who
  // wants Premium upgrades IN PLACE there (prorated, api/premium/upgrade);
  // sending them through checkout would open a second subscription. The checkout
  // route refuses this too — this is just the version with somewhere to go.
  if (isPremium(user)) redirect("/premium");

  const tierName = TIER_NAMES[tier];
  const fullPriceLine =
    plan === "annual"
      ? `${tierAnnualAmount(tier)}/year`
      : `${tierMonthlyAmount(tier)}/${PREMIUM_PRICE_PERIOD}`;
  // The intro offer (lib/site.ts): monthly plans, never-paid accounts. Signed
  // out we cannot know, and a brand-new account has never paid, so the offer
  // is shown; signed in, the same hasEverPaid() rule checkout applies decides.
  const introShown = (paid: boolean) => plan === "monthly" && introOfferEnabled() && !paid;
  let priceLine = introShown(false) ? introPriceLine(tier) : fullPriceLine;

  if (user) {
    // One free trial per account — the same check checkout itself applies, read
    // here only so the launcher's analytics and the copy above it tell the truth.
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { trialStartedAt: true, stripeCustomerId: true },
    });
    const trialEligible = premiumTrialEnabled() && !dbUser?.trialStartedAt;
    priceLine = introShown(await hasEverPaid(dbUser?.stripeCustomerId)) ? introPriceLine(tier) : fullPriceLine;
    return (
      <div className="mx-auto w-full max-w-lg px-4">
        <p className="pt-10 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
          RiftCompare {tierName}
        </p>
        <p className="mt-2 text-center text-sm text-slate-300">
          {trialEligible
            ? // The reminder promise answers the instant-cancel habit ("I prefer to
              // manually renew", 2026-09-24): no need to switch renewal off to be
              // safe — runPremiumTrialReminders emails within the last 24h.
              `${premiumZeroAmount()} due today — your ${PREMIUM_TRIAL_DAYS}-day free trial, then ${priceLine}. We'll email you the day before you're charged, and you can cancel in one click.`
            : `${priceLine} · cancel anytime.`}
        </p>
        <CheckoutLauncher tier={tier} plan={plan} back={back} src={src} trialEligible={trialEligible} />
      </div>
    );
  }

  // Signed out: the sign-in step, in place, with the selection preserved. ?next=
  // is this very URL, so the callback returns here (plus ?welcome= for a brand-
  // new account, which SignupWelcome converts into the sign_up event and strips).
  const selfQuery = new URLSearchParams({ tier, plan, src });
  if (back) selfQuery.set("back", back);
  const selfHref = `${PREMIUM_START_PATH}?${selfQuery.toString()}`;

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-10">
      <div className="card-surface p-6">
        <Link href={back ?? "/premium"} className="mb-3 inline-block text-xs text-slate-500 hover:text-white">
          ← Back
        </Link>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">RiftCompare {tierName}</p>
        <h1 className="mt-1 text-xl font-extrabold text-white">One step: sign in to continue</h1>
        <p className="mt-2 text-sm text-slate-300">
          {premiumTrialEnabled() ? (
            <>
              Your account is free and takes one tap — no card needed for it. Checkout opens straight
              after: {premiumZeroAmount()} due today with the {PREMIUM_TRIAL_DAYS}-day free trial if you
              haven&apos;t had one before, then {priceLine}. A card is required to start the trial, and you can
              cancel any time before it converts.
            </>
          ) : (
            <>
              Your account is free and takes one tap. Checkout opens straight after — {priceLine}, cancel
              anytime.
            </>
          )}
        </p>
        {/* The provider buttons themselves — the same shared form /login renders,
            embedded here so the visitor never has to find the buy button twice. */}
        <div className="mt-4">
          <AuthForm
            providers={enabledProviders()}
            bare
            compact
            source={src === "dialog" ? "premium_dialog" : "premium_cta"}
            next={selfHref}
          />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Not ready? <Link href="/premium" className="text-brand-400 hover:underline">Compare the plans first →</Link>
        </p>
      </div>
    </div>
  );
}
