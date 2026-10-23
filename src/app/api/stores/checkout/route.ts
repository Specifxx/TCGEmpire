import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  STORE_PLAN_AMOUNT,
  STORE_PLAN_PRICE_ID,
  amountCents,
  storeCheckoutMetadata,
  storePlanEnabled,
  storePriceProblem,
  validateStoreName,
  validateStoreUrl,
} from "@/lib/store-plan";

export const dynamic = "force-dynamic";

// Start a Stores plan subscription (lib/store-plan.ts) through Stripe Checkout.
// Signed in only: the plan includes Premium for the buying account, and the
// buyer manages the plan from /stores/account. Nothing is granted here — the
// webhook (checkout.session.completed, metadata.kind "store") records the plan
// once Stripe says it is paid.
export async function POST(req: Request) {
  if (!storePlanEnabled()) {
    return NextResponse.json({ error: "The Stores plan isn't available yet. Email us instead." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first", signIn: "/login?next=/stores" }, { status: 401 });

  const rl = rateLimit(`store-checkout:${user.id}`, 8, 60 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = validateStoreName(body?.storeName);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
  const url = validateStoreUrl(body?.storeUrl);
  if (!url.ok) return NextResponse.json({ error: url.error }, { status: 400 });

  // NEVER CHARGE MORE THAN THE PAGE SAYS (lib/store-plan.ts storePriceProblem):
  // read the Price first and refuse unless it is monthly, USD and at most the
  // amount the sales page displays.
  try {
    const price = await stripe().prices.retrieve(STORE_PLAN_PRICE_ID);
    const problem = storePriceProblem(price, amountCents(STORE_PLAN_AMOUNT));
    if (problem) {
      console.error(`stores checkout refused: STRIPE_STORE_PRICE_ID ${STORE_PLAN_PRICE_ID} does not match the page (${problem})`);
      return NextResponse.json({ error: "The Stores plan can't be bought right now. Email us and we'll sort it out." }, { status: 503 });
    }
  } catch (e) {
    console.error("stores checkout: could not read the Stores price:", e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again shortly." }, { status: 503 });
  }

  const metadata = storeCheckoutMetadata(user.id, name.value, url.value);

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STORE_PLAN_PRICE_ID, quantity: 1 }],
      // The account's existing Stripe customer when it has one, so one billing
      // portal shows both this plan and any Premium subscription.
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata,
      // No trial: the plan is billed from day one.
      subscription_data: { metadata },
      success_url: `${SITE_URL}/stores/account?welcome=1`,
      cancel_url: `${SITE_URL}/stores`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("stores checkout failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
