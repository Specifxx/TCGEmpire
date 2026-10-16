// Creator affiliate codes, the server half (2026-10-16). lib/creator-affiliate-code.ts
// holds the shared rules; this file reads and writes the Affiliate* tables and
// keeps Stripe in step. DECISIONS.md, "Creator codes: 20% off, 20% commission".
//
// HOW A CODE WORKS.
//   - Approving an application (/admin/affiliates) creates an Affiliate row and,
//     on the ONE shared Stripe coupon (AFFILIATE_COUPON_ID, 20% off, forever), a
//     Stripe promotion code whose customer-facing code is the creator's code.
//   - A subscriber reaches checkout with the code from the creator's link
//     (/r/CODE or /premium?code=CODE, remembered in the rc_aff cookie for 30 days)
//     or the code box on /premium. Checkout applies the promotion code and stamps
//     `affiliateCode` on the session and the subscription. Checkout also allows
//     promotion codes typed on Stripe's own page, so a code entered there works
//     too, and is recognised by its promotion code id.
//   - Every PAID invoice on such a subscription records one AffiliateCommission
//     row (unique per invoice, so retries are safe): what was paid, and 20% of it.
//     The owner pays creators by hand and marks rows paid in /admin/affiliates.
// Every table here is PRIVATE: never add one to PUBLIC_MODELS or the export.
import type Stripe from "stripe";
import { prisma } from "./db";
import { stripe } from "./stripe";
import { AFFILIATE_COMMISSION_PERCENT, AFFILIATE_PERCENT_OFF, commissionCents, normaliseAffiliateCode } from "./creator-affiliate-code";

export const AFFILIATE_COUPON_ID = `rc-creator-${AFFILIATE_PERCENT_OFF}-forever`;

export interface ActiveAffiliate {
  id: string;
  code: string;
  name: string;
  percentOff: number;
  stripePromotionCodeId: string | null;
}

/** The active creator behind a code, or null. */
export async function findActiveAffiliate(raw: unknown): Promise<ActiveAffiliate | null> {
  const code = normaliseAffiliateCode(raw);
  if (!code) return null;
  return prisma.affiliate.findFirst({
    where: { code, active: true },
    select: { id: true, code: true, name: true, percentOff: true, stripePromotionCodeId: true },
  });
}

let couponReady = false;
/** The shared 20%-off coupon every creator code hangs off. Created on first use. */
export async function ensureAffiliateCoupon(): Promise<string> {
  if (couponReady) return AFFILIATE_COUPON_ID;
  try {
    await stripe().coupons.retrieve(AFFILIATE_COUPON_ID);
  } catch (e) {
    if ((e as { code?: string }).code !== "resource_missing") throw e;
    try {
      await stripe().coupons.create({
        id: AFFILIATE_COUPON_ID,
        name: `Creator code: ${AFFILIATE_PERCENT_OFF}% off`,
        percent_off: AFFILIATE_PERCENT_OFF,
        duration: "forever",
        metadata: { purpose: "creator-affiliate" },
      });
    } catch (createErr) {
      // Two approvals racing: the loser's create fails but the coupon exists.
      await stripe().coupons.retrieve(AFFILIATE_COUPON_ID).catch(() => {
        throw createErr;
      });
    }
  }
  couponReady = true;
  return AFFILIATE_COUPON_ID;
}

/**
 * Make sure the creator's code exists as a Stripe promotion code and store its
 * id. Reuses one that already carries the code (Stripe refuses a duplicate code).
 */
export async function syncAffiliatePromotionCode(affiliateId: string): Promise<string> {
  const a = await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId }, select: { code: true, stripePromotionCodeId: true, active: true } });
  if (a.stripePromotionCodeId) return a.stripePromotionCodeId;
  const coupon = await ensureAffiliateCoupon();
  const existing = await stripe().promotionCodes.list({ code: a.code, limit: 1 });
  const promo =
    existing.data[0] ??
    (await stripe().promotionCodes.create({ coupon, code: a.code, active: a.active, metadata: { affiliateId, purpose: "creator-affiliate" } }));
  await prisma.affiliate.update({ where: { id: affiliateId }, data: { stripePromotionCodeId: promo.id } });
  return promo.id;
}

/** Switch a code on or off, on the site and on Stripe's checkout page. */
export async function setAffiliateActive(affiliateId: string, active: boolean): Promise<void> {
  const a = await prisma.affiliate.update({ where: { id: affiliateId }, data: { active }, select: { stripePromotionCodeId: true } });
  if (a.stripePromotionCodeId) await stripe().promotionCodes.update(a.stripePromotionCodeId, { active });
}

/** What checkout passes as `discounts` for a creator code. */
export async function affiliateCheckoutDiscount(a: ActiveAffiliate): Promise<{ promotion_code: string } | { coupon: string }> {
  if (a.stripePromotionCodeId) return { promotion_code: a.stripePromotionCodeId };
  return { coupon: await ensureAffiliateCoupon() };
}

// ── Recording use (the Stripe webhook) ─────────────────────────────────────────

type AnyObj = Record<string, unknown>;
const idOf = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && typeof (v as AnyObj).id === "string" ? ((v as AnyObj).id as string) : null);

/** Promotion code ids on an invoice or subscription, across payload generations. */
export function promotionCodeIdsOf(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  const o = obj as AnyObj;
  const out = new Set<string>();
  const take = (d: unknown) => {
    if (d && typeof d === "object") {
      const p = idOf((d as AnyObj).promotion_code);
      if (p) out.add(p);
    }
  };
  take(o.discount);
  if (Array.isArray(o.discounts)) o.discounts.forEach(take);
  return [...out];
}

/** The creator a subscription belongs to: its stamped code first, else its promotion code. */
export async function affiliateForSubscription(sub: unknown, invoice?: unknown): Promise<{ id: string; commissionPercent: number } | null> {
  const meta = (sub && typeof sub === "object" ? ((sub as AnyObj).metadata as AnyObj | undefined) : undefined) ?? {};
  const code = normaliseAffiliateCode(meta.affiliateCode);
  if (code) {
    const a = await prisma.affiliate.findUnique({ where: { code }, select: { id: true, commissionPercent: true } });
    if (a) return a;
  }
  const promos = [...promotionCodeIdsOf(invoice), ...promotionCodeIdsOf(sub)];
  if (!promos.length) return null;
  return prisma.affiliate.findFirst({ where: { stripePromotionCodeId: { in: promos } }, select: { id: true, commissionPercent: true } });
}

/** A referral row for a subscription, created once. */
export async function upsertReferral(affiliateId: string, subscriptionId: string, userId: string | null, customerId: string | null) {
  return prisma.affiliateReferral.upsert({
    where: { stripeSubscriptionId: subscriptionId },
    create: { affiliateId, stripeSubscriptionId: subscriptionId, userId, stripeCustomerId: customerId },
    update: {},
    select: { id: true },
  });
}

/** Checkout completed with a code: remember the referral (a trial counts before anything is paid). */
export async function recordAffiliateCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const code = normaliseAffiliateCode(session.metadata?.affiliateCode);
  const subId = idOf(session.subscription);
  if (!code || !subId) return;
  const a = await prisma.affiliate.findUnique({ where: { code }, select: { id: true } });
  if (!a) return;
  await upsertReferral(a.id, subId, session.metadata?.userId ?? session.client_reference_id ?? null, idOf(session.customer));
}

/** A paid invoice on a referred subscription: one commission row, once. */
export async function recordAffiliateCommission(invoice: unknown, sub: unknown): Promise<"recorded" | "none"> {
  const inv = (invoice ?? {}) as AnyObj;
  const invoiceId = idOf(inv);
  const paid = typeof inv.amount_paid === "number" ? (inv.amount_paid as number) : 0;
  const subId = idOf(sub);
  if (!invoiceId || !subId || paid <= 0) return "none";
  const a = await affiliateForSubscription(sub, invoice);
  if (!a) return "none";
  const meta = ((sub as AnyObj).metadata as AnyObj | undefined) ?? {};
  const ref = await upsertReferral(a.id, subId, typeof meta.userId === "string" ? meta.userId : null, idOf((sub as AnyObj).customer));
  await prisma.affiliateCommission.createMany({
    data: [
      {
        affiliateId: a.id,
        referralId: ref.id,
        stripeInvoiceId: invoiceId,
        amountPaidCents: paid,
        currency: typeof inv.currency === "string" ? (inv.currency as string) : "usd",
        commissionCents: commissionCents(paid, a.commissionPercent ?? AFFILIATE_COMMISSION_PERCENT),
      },
    ],
    skipDuplicates: true,
  });
  return "recorded";
}
