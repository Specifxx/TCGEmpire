import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { isPremium, premiumCheckoutEnabled, trialOfferedTo, premiumPlusEnabled, PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS, priceIdFor, priceCurrencyOf, ensureIntroCoupon, forgetIntroCoupons, hasEverPaid, type PremiumTier } from "@/lib/premium";
import { introOfferEnabled } from "@/lib/site";
import { buildCheckoutSessionParams } from "@/lib/checkout-params";
import { parseCheckoutSelection, sanitizeBackPath } from "@/lib/premium-start";
import { isPremiumSurface } from "@/lib/premium-surface";
import { cookies } from "next/headers";
import { affiliateCheckoutDiscount, findActiveAffiliate } from "@/lib/creator-affiliate";
import { AFFILIATE_COOKIE } from "@/lib/creator-affiliate-code";
import type { CheckoutAffiliate } from "@/lib/checkout-params";

export const dynamic = "force-dynamic";

// Start a RiftCompare Premium subscription via Stripe's hosted Checkout.
// Entitlement is granted by the webhook (invoice.paid → premiumUntil = period
// end), so a user is only ever premium for time that's actually been paid.
//
// SIGNED OUT IS ALLOWED since 2026-10-20 (a guest checkout, lib/guest-checkout.ts):
// Stripe collects the email and the webhook ties the subscription to that
// email's account. The sign-in step before paying was where most of the
// Premium page's visitors stopped (DECISIONS.md, "Premium without signing in first").
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!premiumCheckoutEnabled()) {
    return NextResponse.json({ error: "Premium checkout isn't configured yet" }, { status: 503 });
  }

  // Already paying? Starting a SECOND Stripe subscription is never what anyone
  // means — a Plus member who wants Premium upgrades in place (api/premium/
  // upgrade, prorated) and a Premium member has nothing to buy. /premium/start
  // redirects these people too, but this is the real fence: the route is
  // reachable directly.
  if (user && isPremium(user) && !user.isAdmin) {
    return NextResponse.json(
      { error: "You already have a subscription — manage it from /premium" },
      { status: 409 }
    );
  }

  // Which tier — Plus (cheaper, requires its own Stripe price to be configured)
  // or Premium (the default, and the only option while Plus is unconfigured).
  // Which plan — annual (yearly price) or monthly; priceIdFor() falls back to
  // monthly cleanly if annual is requested but unset for that tier.
  //
  // parseCheckoutSelection is SHARED with /premium/start (lib/premium-start.ts)
  // so the page that shows the price and this route that charges for it apply
  // one rule, not two copies of it.
  const body = await req.json().catch(() => null);
  const sel = parseCheckoutSelection(body?.tier, body?.plan, premiumPlusEnabled());
  const tier: PremiumTier = sel.tier;
  const plan: "monthly" | "annual" = sel.plan;
  const priceId = priceIdFor(tier, plan);

  // Where the visitor was before they started buying — the deck/card page a
  // blur-wall interrupted. Carried through Stripe so both the success and the
  // cancel paths return them there instead of dumping them on /premium.
  const back = sanitizeBackPath(body?.back);

  const dbUser = !user ? null : await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, email: true, trialStartedAt: true },
  });

  // The surface that led here (lib/premium-surface.ts) — validated, so the body
  // can't write an arbitrary string into the table or into Stripe metadata.
  const surface = isPremiumSurface(body?.surface) ? (body.surface as string) : null;

  // Record the strong "started checkout" interest signal (best-effort), with the
  // surface it came from, so the funnel report can say which surfaces produce
  // checkouts and not just clicks — and the tier, so the recovery email names
  // the plan that was abandoned (lib/premium.ts runCheckoutRecovery).
  prisma.premiumClick.create({ data: { userId: user?.id ?? null, source: "checkout", surface, tier } }).catch(() => {});

  // One trial per account, on EITHER tier and EITHER plan (annual trials convert
  // to the yearly price after the trial). Since 2026-09-30 it is a PAID trial: the
  // first PREMIUM_TRIAL_DAYS (30) days for PREMIUM_TRIAL_FEE_CENTS ($1), charged at
  // checkout as a one-time line beside the recurring plan (lib/checkout-params.ts
  // builds the session and says how). A returning customer (trialStartedAt set)
  // gets the plain checkout: no trial, no $1 line. The webhook independently
  // re-checks by card fingerprint, so this gate can't be bypassed for a second
  // trial by re-hitting the endpoint.
  const trialEligible = await trialOfferedTo(dbUser);

  // First 3 months half price (lib/site.ts intro block), monthly plans only,
  // for anyone who has never paid — people who cancelled a trial included.
  // OFF by default since 2026-09-26. If the coupon cannot be read or created the
  // checkout still opens at full price rather than failing: Stripe's own page
  // shows the real amount before anything is charged, and the error is logged
  // for the maintenance check.
  let introCoupon: string | null = null;
  if (introOfferEnabled() && plan === "monthly" && !(await hasEverPaid(dbUser?.stripeCustomerId))) {
    introCoupon = await ensureIntroCoupon(tier, priceId).catch((e) => {
      console.error("intro coupon unavailable — checkout continues at full price:", e);
      return null;
    });
  }

  // A creator code (2026-10-16, lib/creator-affiliate.ts): the one /premium's
  // code box or a creator's /r/CODE link remembered, else one sent in the body.
  // If its Stripe discount cannot be read the checkout still opens, at full
  // price but with the code stamped, so the creator is still credited.
  let affiliate: CheckoutAffiliate | null = null;
  const creator = await findActiveAffiliate(cookies().get(AFFILIATE_COOKIE)?.value ?? body?.affiliateCode).catch(() => null);
  if (creator) {
    const discount = await affiliateCheckoutDiscount(creator).catch((e) => {
      console.error("[affiliate] creator code discount unavailable — checkout continues without it:", e);
      return null;
    });
    affiliate = { code: creator.code, percentOff: creator.percentOff, discount };
  }

  try {
    // The one-time fee line must be in the plan Price's own currency (Stripe
    // refuses mixed currencies in one Checkout), so a paid trial reads it off the
    // Price first. A free trial (fee 0) has no such line and needs no lookup.
    const currency = trialEligible && PREMIUM_TRIAL_FEE_CENTS > 0 ? await priceCurrencyOf(priceId) : "usd";

    // The session parameters for a given intro coupon (or none). A function so a
    // coupon Stripe rejects — deleted in the dashboard while a warm instance
    // still caches its id — can be retried once at full price instead of
    // failing the whole checkout (review, 2026-09-25).
    let dropAffiliateDiscount = false;
    const sessionParams = (coupon: string | null, adaptivePricing = true): Stripe.Checkout.SessionCreateParams =>
      buildCheckoutSessionParams({
        userId: user?.id ?? null,
        email: dbUser?.email,
        stripeCustomerId: dbUser?.stripeCustomerId,
        tier,
        plan,
        priceId,
        currency,
        trial: trialEligible ? { days: PREMIUM_TRIAL_DAYS, feeCents: PREMIUM_TRIAL_FEE_CENTS } : null,
        coupon,
        affiliate: affiliate && dropAffiliateDiscount ? { ...affiliate, discount: null } : affiliate,
        surface,
        back,
        adaptivePricing,
      });

    // Adaptive Pricing first (lib/checkout-params.ts says why); if Stripe refuses
    // that parameter for this account or this mix of line items, the same
    // checkout opens without it, in the plan's own currency, as before.
    const create = async (coupon: string | null): Promise<Stripe.Checkout.Session> => {
      try {
        return await stripe().checkout.sessions.create(sessionParams(coupon));
      } catch (e) {
        const err = e as { param?: string; message?: string };
        if (!(err.param ?? "").startsWith("adaptive_pricing") && !/adaptive.pricing/i.test(err.message ?? "")) throw e;
        console.error("adaptive pricing rejected by Stripe — retrying checkout without it:", e);
        return stripe().checkout.sessions.create(sessionParams(coupon, false));
      }
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await create(introCoupon);
    } catch (e) {
      const param = (e as { param?: string }).param ?? "";
      if (!(introCoupon || affiliate?.discount) || !param.startsWith("discounts")) throw e;
      console.error("discount rejected by Stripe — retrying checkout at full price:", e);
      if (introCoupon) forgetIntroCoupons();
      dropAffiliateDiscount = true;
      session = await create(null);
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("premium checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout — try again" }, { status: 500 });
  }
}
