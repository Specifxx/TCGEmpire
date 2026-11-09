import type Stripe from "stripe";
import { prisma } from "../db";
import { stripe } from "../stripe";
import { sendEmail, emailShell, escapeHtml } from "../email";
import { notifyOwnerBounded } from "../ops/notify-owner";
import { sisterSite } from "../sister-alerts/sites";
import { WEEK_MS, WEEK_PRICE_CENTS, amountFor, startFor, type AdInput, type AdRegion, type PublicAd } from "./core";

// PAID FEATURED LISTINGS, the request half (lib/sister-ads/core.ts has the rules).
// Orders live in SisterAd; the card is only AUTHORISED at Checkout
// (capture_method "manual") and captured when the owner approves, so a seller
// whose listing is refused is never charged. A card hold lasts seven days, so
// the owner is told about every order at once and the admin page lists the
// oldest first.

/** Make the order and its Checkout Session; the seller is sent to the session's url. */
export async function createOrder(siteKey: string, ad: AdInput): Promise<{ url: string }> {
  const site = sisterSite(siteKey);
  if (!site) throw new Error("unknown site");
  const row = await prisma.sisterAd.create({
    data: { site: site.key, weeks: ad.weeks, amountCents: amountFor(ad.weeks), title: ad.title, blurb: ad.blurb, destUrl: ad.destUrl, imageUrl: ad.imageUrl, priceText: ad.priceText, region: ad.region, email: ad.email },
    select: { id: true },
  });
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: ad.email,
    line_items: [
      {
        quantity: ad.weeks,
        price_data: {
          currency: "usd",
          unit_amount: WEEK_PRICE_CENTS,
          product_data: { name: `Featured listing on ${site.name}, per week`, description: ad.title.slice(0, 120) },
        },
      },
    ],
    payment_intent_data: {
      capture_method: "manual",
      description: `${site.name} featured listing (${ad.weeks} week${ad.weeks > 1 ? "s" : ""})`,
      metadata: { kind: "sister_ad", adId: row.id, site: site.key },
    },
    metadata: { kind: "sister_ad", adId: row.id, site: site.key },
    custom_text: {
      submit: { message: "Your card is only held for now. It is charged when we approve your listing (usually within two days), and released if we can't." },
    },
    success_url: `${site.url}/advertise/thanks`,
    cancel_url: `${site.url}/advertise?cancelled=1`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  await prisma.sisterAd.update({ where: { id: row.id }, data: { stripeSessionId: session.id } });
  if (!session.url) throw new Error("no checkout url");
  return { url: session.url };
}

/** Webhook: Checkout finished, the card is authorised. Idempotent. */
export async function adPaid(session: Stripe.Checkout.Session): Promise<void> {
  const id = session.metadata?.adId;
  if (!id) return;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  const r = await prisma.sisterAd.updateMany({
    where: { id, status: "awaiting_payment" },
    data: { status: "pending", paymentIntentId: pi, paidAt: new Date() },
  });
  if (r.count === 0) return;
  const ad = await prisma.sisterAd.findUnique({ where: { id }, select: { site: true, title: true, weeks: true, destUrl: true, email: true } });
  if (!ad) return;
  await notifyOwnerBounded({
    kind: "sister-ad",
    headline: `${sisterSite(ad.site)?.name ?? ad.site}: ${ad.title}`,
    from: ad.email,
    fields: [["Site", sisterSite(ad.site)?.name ?? ad.site], ["Weeks", String(ad.weeks)], ["Link", ad.destUrl], ["Approve or reject", "riftcompare.com/admin/sister-ads (the card is held, not charged, until you approve)"]],
  });
}

/** Webhook: the seller never finished Checkout. */
export async function adAbandoned(session: Stripe.Checkout.Session): Promise<void> {
  const id = session.metadata?.adId;
  if (id) await prisma.sisterAd.updateMany({ where: { id, status: "awaiting_payment" }, data: { status: "cancelled", reason: "Checkout was not completed." } });
}

function mail(to: string, subject: string, lines: string[]) {
  const inner = lines.map((l) => `<tr><td style="padding:6px 32px;font-size:14px;color:#b8c0cc">${escapeHtml(l)}</td></tr>`).join("");
  return sendEmail(to, subject, emailShell(subject, inner, "Compare Empire featured listings"), { text: lines.join("\n\n") }).catch(() => false);
}

/** Admin: capture the payment, set the dates, tell the seller. */
export async function approveAd(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ad = await prisma.sisterAd.findUnique({ where: { id } });
  if (!ad || ad.status !== "pending" || !ad.paymentIntentId) return { ok: false, error: "Not waiting for approval." };
  try {
    await stripe().paymentIntents.capture(ad.paymentIntentId);
  } catch (e) {
    return { ok: false, error: `Stripe could not take the payment (the 7-day card hold may have expired): ${(e as Error).message}` };
  }
  const now = Date.now();
  const live = await prisma.sisterAd.findMany({ where: { site: ad.site, status: "approved", endsAt: { gt: new Date(now) } }, select: { endsAt: true } });
  const start = startFor(now, live.map((l) => l.endsAt!.getTime()));
  const end = start + ad.weeks * WEEK_MS;
  await prisma.sisterAd.update({ where: { id }, data: { status: "approved", startsAt: new Date(start), endsAt: new Date(end), reason: null } });
  const site = sisterSite(ad.site);
  const day = (t: number) => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  await mail(ad.email, `Your featured listing on ${site?.name ?? ad.site} is approved`, [
    `Your listing "${ad.title}" is approved and your card has been charged US$${(ad.amountCents / 100).toFixed(0)}.`,
    `It shows on ${site?.name ?? ad.site} from ${day(start)} to ${day(end)} (UTC)${start > now + 3_600_000 ? ", when the next featured slot frees up" : ""}. New ads appear within about six hours of approval and come down on their own at the end date.`,
    `It is labelled "Paid link" and is kept apart from the price comparison. Questions: reply to this email.`,
  ]);
  return { ok: true };
}

/** Admin: refuse it and release the held card. */
export async function rejectAd(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ad = await prisma.sisterAd.findUnique({ where: { id } });
  if (!ad || ad.status !== "pending") return { ok: false, error: "Not waiting for approval." };
  if (ad.paymentIntentId) {
    try {
      await stripe().paymentIntents.cancel(ad.paymentIntentId);
    } catch (e) {
      return { ok: false, error: `Stripe could not release the card hold: ${(e as Error).message}` };
    }
  }
  const why = reason.trim().slice(0, 300) || "It does not meet our featured listing rules.";
  await prisma.sisterAd.update({ where: { id }, data: { status: "rejected", reason: why } });
  await mail(ad.email, `Your featured listing was not approved`, [
    `We couldn't approve "${ad.title}": ${why}`,
    `You have not been charged; the hold on your card is released and disappears from your statement within a few days.`,
  ]);
  return { ok: true };
}

/** Admin: take a live ad down early (the seller keeps no refund unless the owner refunds in Stripe). */
export async function endAd(id: string): Promise<void> {
  await prisma.sisterAd.updateMany({ where: { id, status: "approved" }, data: { endsAt: new Date() } });
}

/** The ads one site may draw now: approved, started or about to, not ended. */
export async function liveAds(siteKey: string): Promise<PublicAd[]> {
  const now = new Date();
  const rows = await prisma.sisterAd.findMany({
    where: { site: siteKey, status: "approved", endsAt: { gt: now }, startsAt: { not: null } },
    orderBy: { startsAt: "asc" },
    take: 12,
    select: { id: true, title: true, blurb: true, destUrl: true, imageUrl: true, priceText: true, region: true, startsAt: true, endsAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    blurb: r.blurb,
    url: r.destUrl,
    image: r.imageUrl,
    price: r.priceText,
    region: r.region as AdRegion,
    startsAt: r.startsAt!.toISOString(),
    endsAt: r.endsAt!.toISOString(),
  }));
}
