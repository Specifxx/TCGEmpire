// The price ladder test's database and Stripe half (rules in lib/premium-pass.ts).
import type Stripe from "stripe";
import { prisma } from "./db";
import { isPremium } from "./premium";
import { freeWeekMayCheckout } from "./premium-free-week-server";
import { notifyOwnerBounded } from "./ops/notify-owner";
import { FOUNDER_SEATS, FOUNDER_SOLD_KEY, PASSES, parsePassKind, passHolderKey, passOffersFor, passUntil, type PassKind, type PassOffer } from "./premium-pass";

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
  // Any paid tier counts, Plus included (a grandfathered Plus subscriber is never sold a pass on top).
  if (!isPremium(u)) return false;
  return !(await freeWeekMayCheckout(u).catch(() => false));
}

/** Did this account buy a pass? (Then it is paying, whatever else it holds.) */
export async function holdsPass(userId: string): Promise<boolean> {
  return !!(await prisma.counter.findUnique({ where: { key: passHolderKey(userId) }, select: { key: true } }));
}

/**
 * Take one Founder seat, atomically: the row is created at 0 once, then only an update whose value is still under the
 * cap goes through, so 100 is a hard ceiling however many checkouts open at once. Returns false when none is left.
 */
export async function reserveFounderSeat(): Promise<boolean> {
  await prisma.counter.upsert({ where: { key: FOUNDER_SOLD_KEY }, create: { key: FOUNDER_SOLD_KEY, value: 0 }, update: {} });
  const r = await prisma.counter.updateMany({ where: { key: FOUNDER_SOLD_KEY, value: { lt: FOUNDER_SEATS } }, data: { value: { increment: 1 } } });
  return r.count === 1;
}

/** Give a seat back: a Founder checkout expired unpaid, or could not be opened. Never below 0. */
export async function releaseFounderSeat(): Promise<void> {
  await prisma.counter.updateMany({ where: { key: FOUNDER_SOLD_KEY, value: { gt: 0 } }, data: { value: { decrement: 1 } } });
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
    // Stripe's shortest hold, so an abandoned Founder checkout gives its seat back within the hour.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
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
    // Paid with nowhere to put it: the marker stays (a retry cannot help), and the owner hears about it to refund.
    console.error(`[premium-pass] paid ${kind} session ${sessionId} for a missing account ${userId}`);
    await notifyOwnerBounded({
      kind: "support",
      headline: `A ${PASSES[kind].name} was paid for an account that no longer exists`,
      fields: [["Stripe Checkout session", sessionId], ["Account id", userId]],
      body: "Refund it in the Stripe dashboard (Payments, search the session id).",
    });
    return "ignored";
  }
  const current = u.premiumUntil ? u.premiumUntil.getTime() : null;
  // One transaction: the grant, the holder marker and the Week Pass tally land together or not at all. The Founder seat
  // was already taken when the checkout opened (reserveFounderSeat).
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { premiumUntil: new Date(passUntil(kind, now, current)), premiumTier: "premium" } }),
    prisma.counter.upsert({ where: { key: passHolderKey(userId) }, create: { key: passHolderKey(userId), value: Math.floor(now / 1000) }, update: {} }),
    ...(kind === "week"
      ? [prisma.counter.upsert({ where: { key: WEEK_SOLD_KEY }, create: { key: WEEK_SOLD_KEY, value: 1 }, update: { value: { increment: 1 } } })]
      : []),
  ]);
  return "granted";
}

/** checkout.session.expired for a Founder checkout that was never paid: its reserved seat goes back. */
export async function passExpired(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== "premium_pass" || session.metadata?.pass !== "founder" || session.payment_status === "paid") return;
  const marker = `pass:x:${session.id}`;
  try {
    await prisma.counter.create({ data: { key: marker, value: 1 } });
  } catch {
    return; // already released
  }
  await releaseFounderSeat();
}
