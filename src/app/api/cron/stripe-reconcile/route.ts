import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import {
  customerIdOf,
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  userIdFromSubscription,
} from "@/lib/stripe-entitlement";

// Daily Stripe ↔ premiumUntil reconciliation — the safety net under the webhook.
//
// Entitlement used to be written ONLY by webhook events, so one missed or
// unparsed event stranded a paying customer as "lapsed" until someone noticed
// (the Naron incident, Aug 2026: a trial converted to a paid year on Stripe
// while the site kept his trial-end date). Stripe retries webhooks for ~3 days
// and then gives up forever; this cron closes that hole by re-deriving
// entitlement from the source of truth — the subscription list itself — once a
// day. Every stamp is EXTEND-ONLY (see lib/stripe-entitlement.ts), so the sweep
// can never shorten a comp grant or already-paid time, and running it twice is
// a no-op. Subscriptions that entitle someone but can't be matched to an
// account are reported loudly instead of skipped silently — that unmatched list
// IS the "paying customer with no premium" alarm.
//
// Triggered by Vercel Cron (see vercel.json) or manually with
// Authorization: Bearer <CRON_SECRET>, same as the other cron routes.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

// Everything currently entitled to access. `canceled` is deliberately absent:
// a canceled sub keeps whatever time was already stamped, it just stops
// extending — reconciling it would be a no-op by construction.
const STATUSES: Stripe.SubscriptionListParams.Status[] = ["active", "trialing", "past_due"];

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!stripeEnabled()) {
    return NextResponse.json({ ok: true, skipped: "stripe not configured" });
  }

  const extended: { email: string | null; userId: string; until: string; subscription: string }[] = [];
  const unmatched: { subscription: string; customer: string | null; customerEmail: string | null }[] = [];
  const linked: string[] = [];
  let checked = 0;

  try {
    for (const status of STATUSES) {
      // Premium's whole base is well under one page today; the pagination is so
      // this never silently truncates once it isn't.
      for await (const sub of stripe().subscriptions.list({ status, limit: 100 })) {
        checked++;
        const until = entitledUntilFromSubscription(sub);
        if (!until) continue;
        const customerId = customerIdOf(sub);

        // Resolve the account: checkout-stamped metadata, then the stored
        // customer link, then the Stripe customer's email as a last resort
        // (covers users whose linking webhook was itself the missed event).
        let userId = userIdFromSubscription(sub);
        let user =
          (userId
            ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, premiumUntil: true, stripeCustomerId: true } })
            : null) ??
          (customerId
            ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true, email: true, premiumUntil: true, stripeCustomerId: true } })
            : null);
        let customerEmail: string | null = null;
        if (!user && customerId) {
          try {
            const customer = await stripe().customers.retrieve(customerId);
            customerEmail = "deleted" in customer && customer.deleted ? null : (customer.email ?? null);
          } catch {
            /* unmatched report below still fires */
          }
          if (customerEmail) {
            user = await prisma.user.findFirst({
              where: { email: { equals: customerEmail, mode: "insensitive" } },
              select: { id: true, email: true, premiumUntil: true, stripeCustomerId: true },
            });
          }
        }
        if (!user) {
          console.error(`stripe-reconcile: entitled subscription ${sub.id} has no matching account (customer ${customerId ?? "?"}, ${customerEmail ?? "no email"})`);
          unmatched.push({ subscription: sub.id, customer: customerId, customerEmail });
          continue;
        }

        const next = extendedPremiumUntil(user.premiumUntil, until);
        const link = customerId && !user.stripeCustomerId;
        if (!next && !link) continue;
        await prisma.user.update({
          where: { id: user.id },
          data: { ...(next ? { premiumUntil: next } : {}), ...(link ? { stripeCustomerId: customerId } : {}) },
        });
        if (next) {
          console.log(`stripe-reconcile: extended ${user.email} to ${next.toISOString()} (sub ${sub.id})`);
          extended.push({ email: user.email, userId: user.id, until: next.toISOString(), subscription: sub.id });
        }
        if (link) linked.push(user.id);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "reconcile failed";
    console.error("stripe-reconcile failed:", e);
    return NextResponse.json({ ok: false, error: message, checked, extended, unmatched }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checked, extended, customersLinked: linked.length, unmatched });
}
