import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";
import { buildCheckoutSessionParams } from "@/lib/checkout-params";
import { isPremium, premiumCheckoutEnabled, priceCurrencyOf, priceIdFor, trialOfferedTo, PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS } from "@/lib/premium";
import { premiumCors, premiumSiteForOrigin, verifyPremiumSession } from "@/lib/sister-premium";

export const dynamic = "force-dynamic";

// Premium checkout started ON the sister site (owner, 2026-11-10: the member never visits riftcompare.com). The sister's browser sends its
// premium-session token; we open Stripe's hosted Checkout for that account (the same Premium price, trial and webhook as /api/premium/
// checkout) and send them back to the sister site after paying or cancelling. Returns { url } for the browser to follow.
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  if (!rateLimit(`sister-premium-checkout:${clientIp(req)}`, 10, 10 * 60_000).ok) return NextResponse.json({ error: "Too many tries." }, { status: 429, headers });
  if (!premiumCheckoutEnabled()) return NextResponse.json({ error: "Checkout isn't available right now." }, { status: 503, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown; plan?: unknown } | null;
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  const plan: "monthly" | "annual" = body?.plan === "annual" ? "annual" : "monthly";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, stripeCustomerId: true, trialStartedAt: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true, isAdmin: true },
    });
    if (!user) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    if (isPremium(user, "premium")) return NextResponse.json({ error: "You're already a member." }, { status: 409, headers });
    const priceId = priceIdFor("premium", plan);
    const trialEligible = await trialOfferedTo(user);
    const currency = trialEligible && PREMIUM_TRIAL_FEE_CENTS > 0 ? await priceCurrencyOf(priceId) : "usd";
    prisma.premiumClick.create({ data: { userId: user.id, source: "checkout", surface: `sister-${site.key}`, tier: "premium" } }).catch(() => {});
    const params = (adaptivePricing: boolean): Stripe.Checkout.SessionCreateParams =>
      buildCheckoutSessionParams({
        userId: user.id,
        email: user.email,
        stripeCustomerId: user.stripeCustomerId,
        tier: "premium",
        plan,
        priceId,
        currency,
        trial: trialEligible ? { days: PREMIUM_TRIAL_DAYS, feeCents: PREMIUM_TRIAL_FEE_CENTS } : null,
        coupon: null,
        surface: `sister-${site.key}`,
        adaptivePricing,
        returnUrls: { success: `${site.url}/premium?welcome=1`, cancel: `${site.url}/premium` },
      });
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe().checkout.sessions.create(params(true));
    } catch {
      session = await stripe().checkout.sessions.create(params(false));
    }
    if (!session.url) throw new Error("no checkout url");
    return NextResponse.json({ ok: true, url: session.url }, { headers });
  } catch (e) {
    console.error("[sister-premium] checkout failed:", e);
    return NextResponse.json({ error: "Couldn't open checkout. Try again." }, { status: 502, headers });
  }
}
