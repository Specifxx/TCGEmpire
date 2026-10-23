// The database half of the Stores plan (lib/store-plan.ts holds the rules).
// Every read here is scoped to one subscription, one partner or one retailer
// key, with a narrow select (egress rules 1 and 3, src/lib/db.ts).
import { prisma } from "./db";
import { sendEmail, emailShell, escapeHtml } from "./email";
import { SITE_URL } from "./site";
import { planPartnerActive } from "./store-plan";

/**
 * First sight of a Stores plan (the checkout webhook). Creates the row once,
 * keyed by the Stripe subscription id; a replay (checkout.session.completed
 * and async_payment_succeeded both fire for some payment methods) only extends
 * activeUntil. `created` tells the webhook whether to tell the owner.
 */
export async function recordStorePlanStart(p: {
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  storeName: string;
  storeUrl: string;
  activeUntil: Date | null;
}): Promise<{ created: boolean; id: string }> {
  const existing = await prisma.storePlanSubscription.findUnique({
    where: { stripeSubscriptionId: p.stripeSubscriptionId },
    select: { id: true },
  });
  if (existing) {
    if (p.activeUntil) await extendStorePlan(p.stripeSubscriptionId, p.activeUntil);
    return { created: false, id: existing.id };
  }
  try {
    const row = await prisma.storePlanSubscription.create({
      data: {
        userId: p.userId,
        stripeSubscriptionId: p.stripeSubscriptionId,
        stripeCustomerId: p.stripeCustomerId,
        storeName: p.storeName,
        storeUrl: p.storeUrl,
        activeUntil: p.activeUntil,
      },
      select: { id: true },
    });
    return { created: true, id: row.id };
  } catch (e) {
    // Two deliveries racing: the other one created it. Extend and move on.
    if ((e as { code?: string }).code === "P2002") {
      const row = await prisma.storePlanSubscription.findUnique({ where: { stripeSubscriptionId: p.stripeSubscriptionId }, select: { id: true } });
      if (row) {
        if (p.activeUntil) await extendStorePlan(p.stripeSubscriptionId, p.activeUntil);
        return { created: false, id: row.id };
      }
    }
    throw e;
  }
}

/**
 * EXTEND-ONLY, like premiumUntil (lib/stripe-entitlement.ts extendedPremiumUntil):
 * one conditional write that moves activeUntil forward and never back, so
 * out-of-order events and the daily reconcile cannot shorten paid time. A
 * subscription with no row yet (a renewal event racing the checkout event) is
 * a no-op; the checkout event creates it with the period end.
 */
export async function extendStorePlan(stripeSubscriptionId: string, until: Date): Promise<number> {
  const r = await prisma.storePlanSubscription.updateMany({
    where: { stripeSubscriptionId, OR: [{ activeUntil: null }, { activeUntil: { lt: until } }] },
    data: { activeUntil: until },
  });
  return r.count;
}

/** The plan behind a partner, or null for a pilot partner (no subscription). A missing row reads as unpaid. */
export async function planOfPartner(partner: { planSubscriptionId: string | null }): Promise<{ activeUntil: Date | null } | null> {
  if (!partner.planSubscriptionId) return null;
  const sub = await prisma.storePlanSubscription.findUnique({
    where: { id: partner.planSubscriptionId },
    select: { activeUntil: true },
  });
  return sub ?? { activeUntil: null };
}

export interface VerifiedStoreProfile {
  about: string | null;
  promo: string | null;
}

/**
 * The Verified mark for /stores/<slug>: the partner for this retailer key that
 * has a RUNNING plan, with its own words. Null for every other store, for a
 * pilot partner (it never bought the plan) and on any read failure: the mark is
 * an extra, never a reason for the page to fail. Nothing here is read by any
 * comparison or ranking.
 */
export async function verifiedStoreProfile(retailer: string, now = new Date()): Promise<VerifiedStoreProfile | null> {
  try {
    const partners = await prisma.storePartner.findMany({
      where: { retailer, planSubscriptionId: { not: null } },
      select: { planSubscriptionId: true, about: true, promo: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (!partners.length) return null;
    const subs = await prisma.storePlanSubscription.findMany({
      where: { id: { in: partners.map((p) => p.planSubscriptionId!) } },
      select: { id: true, activeUntil: true },
    });
    const byId = new Map(subs.map((s) => [s.id, s]));
    const live = partners.find((p) => planPartnerActive(byId.get(p.planSubscriptionId!) ?? { activeUntil: null }, now));
    return live ? { about: live.about, promo: live.promo } : null;
  } catch (e) {
    console.error(`stores/${retailer}: verified profile read failed:`, e);
    return null;
  }
}

/** The email that hands a paying store its private report link (sent when the owner links the plan). */
export function buildStoreReportEmail(storeName: string, reportUrl: string): { subject: string; html: string; text: string } {
  const account = `${SITE_URL}/stores/account`;
  const subject = `Your RiftCompare store report is ready: ${storeName}`.slice(0, 120);
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:15px;line-height:1.6;color:#b8c0cc">We've confirmed which tracked store is <strong style="color:#fff">${escapeHtml(storeName)}</strong>. Your private repricing report is live and updates with every price import.</td></tr>
    <tr><td style="padding:14px 32px 6px"><a href="${escapeHtml(reportUrl)}" style="display:inline-block;background:#ef7d00;color:#1e3043;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Open your report →</a></td></tr>
    <tr><td style="padding:10px 32px 4px;font-size:13px;line-height:1.6;color:#8b95a5">The link is the password: anyone who has it can open the report, so share it only with your team. Add your store's description and promo, and manage billing, at <a href="${account}" style="color:#ef7d00">${account}</a>.</td></tr>
    <tr><td style="padding:6px 32px 8px;font-size:13px;line-height:1.6;color:#8b95a5">Paying for the plan never changes your place in any price comparison on RiftCompare.</td></tr>`;
  const footer = `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">You're getting this because you subscribed to the RiftCompare Stores plan. Reply to this email with any question.</td></tr>`;
  const text = [
    `Your RiftCompare store report for ${storeName} is ready.`,
    "",
    `Open it: ${reportUrl}`,
    "",
    "The link is the password: share it only with your team.",
    `Your description, promo and billing: ${account}`,
    "",
    "Paying for the plan never changes your place in any price comparison on RiftCompare.",
  ].join("\n");
  return { subject, html: emailShell("Your store report is ready", inner, footer, `Your private report for ${storeName}`), text };
}

export async function sendStoreReportEmail(to: string, storeName: string, reportUrl: string): Promise<boolean> {
  const m = buildStoreReportEmail(storeName, reportUrl);
  return sendEmail(to, m.subject, m.html, { text: m.text }).catch(() => false);
}
