// The price ladder test's database and Stripe half (rules in lib/premium-pass.ts).
import type Stripe from "stripe";
import { prisma } from "./db";
import { isPremium } from "./premium";
import { freeWeekMayCheckout } from "./premium-free-week-server";
import { FOUNDER_SEATS, FOUNDER_SOLD_KEY, PASSES, parsePassKind, passOffersFor, passUntil, type PassKind, type PassOffer } from "./premium-pass";

export const WEEK_SOLD_KEY = "pass:week:sold";

export async function founderSold(): Promise<number> {
  const row = await prisma.counter.findUnique({ where: { key: FOUNDER_SOLD_KEY }, select: { value: true } });
  return row?.value ?? 0;
}

type PassUser = {
  id: string;
  createdAt: Date;
  stripeCustomerId: string | null;
  premiumUntil: Date | null;
  premiumTier: string | null;
  premiumTierFloor: string | null;
  isAdmin: boolean;
};

export const PASS_USER_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  stripeCustomerId: true,
  premiumUntil: true,
  premiumTier: true,
  premiumTierFloor: true,
  isAdmin: true,
} as const;

/** Premium held by a subscription or an earlier pass. A free week (lib/premium-free-week.ts) does not count. */
async function entitledByPayment(u: PassUser): Promise<boolean> {
  if (u.isAdmin) return true;
  if (!isPremium(u, "premium")) return false;
  return !(await freeWeekMayCheckout(u).catch(() => false));
}

export async function passOffersForUser(u: PassUser, now: number = Date.now()): Promise<PassOffer[]> {
  return passOffersFor({
    userId: u.id,
    createdAt: u.createdAt.getTime(),
    entitledByPayment: await entitledByPayment(u),
    founderSold: await founderSold().catch(() => FOUNDER_SEATS),
    now,
  });
}

/**
 * The one-off Checkout for a pass. Inline price_data (no Stripe Price to create), mode "payment", no saved customer:
 * buying a pass must never mark the account "ever paid" and cost it the 14-day card trial later. `kind: "premium_pass"`
 * in the metadata is what the webhook reads.
 */
export function passSessionParams(o: {
  kind: PassKind;
  userId: string;
  email: string;
  siteKey: string;
  billedBy: string;
  successUrl: string;
  cancelUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const p = PASSES[o.kind];
  return {
    mode: "payment",
    customer_email: o.email,
    client_reference_id: o.userId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: p.cents,
          product_data: {
            name: p.name,
            description: o.kind === "week" ? "Every Premium feature for 7 days. Charged once, never renews." : "Premium for good. Charged once, never renews.",
          },
        },
      },
    ],
    metadata: { kind: "premium_pass", pass: o.kind, userId: o.userId, surface: `sister-${o.siteKey}` },
    payment_intent_data: { metadata: { kind: "premium_pass", pass: o.kind, userId: o.userId } },
    custom_text: { submit: { message: `${o.billedBy} One payment, no subscription.` } },
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
  };
}

/**
 * The webhook's branch for a paid pass. Idempotent per Checkout session (a Counter row per session id), extend-only
 * on premiumUntil, and the Founder seat count goes up once per paid session.
 */
export async function passPaid(session: Stripe.Checkout.Session, now: number = Date.now()): Promise<"granted" | "duplicate" | "ignored"> {
  const kind = parsePassKind(session.metadata?.pass);
  const userId = session.metadata?.userId;
  if (!kind || !userId || session.payment_status !== "paid") return "ignored";
  const marker = `pass:s:${session.id}`;
  try {
    await prisma.counter.create({ data: { key: marker, value: Math.floor(now / 1000) } });
  } catch {
    return "duplicate";
  }
  try {
    return await grantPass(session.id, kind, userId, now);
  } catch (e) {
    // Let Stripe's retry try again: the marker must not block it.
    await prisma.counter.delete({ where: { key: marker } }).catch(() => {});
    throw e;
  }
}

async function grantPass(sessionId: string, kind: PassKind, userId: string, now: number): Promise<"granted" | "ignored"> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } });
  if (!u) {
    console.error(`[premium-pass] paid ${kind} session ${sessionId} for a missing account ${userId}`);
    return "ignored";
  }
  const current = u.premiumUntil ? u.premiumUntil.getTime() : null;
  const hadActive = current !== null && current > now;
  await prisma.user.update({
    where: { id: userId },
    data: { premiumUntil: new Date(passUntil(kind, now, current)), ...(hadActive && kind === "week" ? {} : { premiumTier: "premium" }) },
  });
  if (kind === "founder") {
    await prisma.counter.upsert({ where: { key: FOUNDER_SOLD_KEY }, create: { key: FOUNDER_SOLD_KEY, value: 1 }, update: { value: { increment: 1 } } });
  } else {
    await prisma.counter.upsert({ where: { key: WEEK_SOLD_KEY }, create: { key: WEEK_SOLD_KEY, value: 1 }, update: { value: { increment: 1 } } }).catch(() => {});
  }
  return "granted";
}
