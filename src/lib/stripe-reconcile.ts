import type Stripe from "stripe";
import { prisma } from "./db";
import { stripe, stripeEnabled } from "./stripe";
import { sendEmail, emailShell } from "./email";
import { SUPPORT_EMAIL, SITE_URL } from "./site";
import {
  customerIdOf,
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  userIdFromSubscription,
} from "./stripe-entitlement";

// Stripe ↔ premiumUntil reconciliation — the safety net under the webhook, and
// the self-healing half of the Naron incident fix (Aug 2026).
//
// Entitlement used to be written ONLY by webhook events, so one missed or
// unparsed event stranded a paying customer as "lapsed" until a human noticed.
// This re-derives entitlement from the source of truth — Stripe's own
// subscription list — and is deliberately callable from THREE places:
//   • the daily cron (/api/cron/stripe-reconcile, CRON_SECRET)
//   • an admin click (/api/admin/stripe-reconcile, admin session or ADMIN_TOKEN)
//   • any future support tooling
// The admin path matters: the fix for a stranded customer must never require a
// shell and a secret, which is exactly what made the original incident slow to
// remediate.
//
// Every stamp is EXTEND-ONLY (see stripe-entitlement.ts), so running this twice,
// or alongside the webhook, or after a manual grant, can never shorten anyone's
// access. Subscriptions that entitle someone but match no account are reported
// AND emailed — an unhealable case must never be silent.

// Everything currently entitled to access. `canceled` is deliberately absent: a
// canceled sub keeps whatever time was already stamped, it just stops extending,
// so reconciling it would be a no-op by construction.
const STATUSES: Stripe.SubscriptionListParams.Status[] = ["active", "trialing", "past_due"];

export interface ReconcileExtension {
  email: string | null;
  userId: string;
  /** ISO — what premiumUntil was before this sweep (null = never had one). */
  from: string | null;
  /** ISO — what it is now. */
  until: string;
  subscription: string;
}

export interface ReconcileUnmatched {
  subscription: string;
  customer: string | null;
  customerEmail: string | null;
  until: string;
}

export interface ReconcileSummary {
  ok: boolean;
  /** Set when Stripe isn't configured — nothing ran, and that isn't a failure. */
  skipped?: string;
  checked: number;
  extended: ReconcileExtension[];
  unmatched: ReconcileUnmatched[];
  customersLinked: number;
  error?: string;
}

type UserRow = { id: string; email: string; premiumUntil: Date | null; stripeCustomerId: string | null };
const USER_SELECT = { id: true, email: true, premiumUntil: true, stripeCustomerId: true } as const;

/**
 * Sweep every entitled Stripe subscription and extend the matching account.
 * `notify` sends the admin alert when anything noteworthy happened (default on;
 * the cron wants it, a manual admin run that already shows the result on screen
 * does not need it twice).
 */
export async function runStripeReconcile({ notify = true }: { notify?: boolean } = {}): Promise<ReconcileSummary> {
  if (!stripeEnabled()) {
    return { ok: true, skipped: "stripe not configured", checked: 0, extended: [], unmatched: [], customersLinked: 0 };
  }

  const extended: ReconcileExtension[] = [];
  const unmatched: ReconcileUnmatched[] = [];
  let customersLinked = 0;
  let checked = 0;

  try {
    for (const status of STATUSES) {
      // Premium's whole base fits in well under one page today; the pagination
      // is so this never silently truncates once it doesn't.
      for await (const sub of stripe().subscriptions.list({ status, limit: 100 })) {
        checked++;
        const until = entitledUntilFromSubscription(sub);
        if (!until) continue;
        const customerId = customerIdOf(sub);

        // Resolve the account three ways, in order of reliability: the userId
        // stamped into subscription metadata at checkout, the stored customer
        // link, then the Stripe customer's email (which covers a user whose
        // LINKING webhook was itself the missed event).
        const metaUserId = userIdFromSubscription(sub);
        let user: UserRow | null = metaUserId
          ? await prisma.user.findUnique({ where: { id: metaUserId }, select: USER_SELECT })
          : null;
        if (!user && customerId) {
          user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: USER_SELECT });
        }
        let customerEmail: string | null = null;
        if (!user && customerId) {
          try {
            const customer = await stripe().customers.retrieve(customerId);
            customerEmail = "deleted" in customer && customer.deleted ? null : (customer.email ?? null);
          } catch {
            /* the unmatched report below still fires */
          }
          if (customerEmail) {
            user = await prisma.user.findFirst({
              where: { email: { equals: customerEmail, mode: "insensitive" } },
              select: USER_SELECT,
            });
          }
        }

        if (!user) {
          console.error(
            `stripe-reconcile: entitled subscription ${sub.id} has no matching account (customer ${customerId ?? "?"}, ${customerEmail ?? "no email"})`
          );
          unmatched.push({ subscription: sub.id, customer: customerId, customerEmail, until: until.toISOString() });
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
          extended.push({
            email: user.email,
            userId: user.id,
            from: user.premiumUntil?.toISOString() ?? null,
            until: next.toISOString(),
            subscription: sub.id,
          });
        }
        if (link) customersLinked++;
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "reconcile failed";
    console.error("stripe-reconcile failed:", e);
    return { ok: false, error, checked, extended, unmatched, customersLinked };
  }

  // ALERT ON ANY MOVEMENT. In steady state both lists are empty and this is
  // silent. A non-empty `extended` means a webhook was missed (the customer is
  // now fixed, but the endpoint needs looking at); a non-empty `unmatched` means
  // someone is paying Stripe and getting nothing, which no automation can fix —
  // that one is worth an email every single day until it's resolved.
  if (notify && (extended.length > 0 || unmatched.length > 0)) {
    await sendReconcileAlert(extended, unmatched).catch((e) =>
      console.error("stripe-reconcile: alert email failed:", e)
    );
  }

  return { ok: true, checked, extended, unmatched, customersLinked };
}

async function sendReconcileAlert(extended: ReconcileExtension[], unmatched: ReconcileUnmatched[]): Promise<void> {
  const rows: string[] = [];
  if (unmatched.length) {
    rows.push(
      `<tr><td style="padding:8px 32px 4px;font-size:14px;color:#fff"><strong>${unmatched.length} paying subscription${unmatched.length === 1 ? "" : "s"} with no matching account</strong> — these people are being charged and have no Premium. Needs a human.</td></tr>`,
      ...unmatched.map(
        (u) =>
          `<tr><td style="padding:2px 32px;font-size:13px;color:#b8c0cc">${escapeHtml(u.customerEmail ?? "no email on customer")} · ${escapeHtml(u.subscription)} · paid through ${u.until.slice(0, 10)}</td></tr>`
      )
    );
  }
  if (extended.length) {
    rows.push(
      `<tr><td style="padding:14px 32px 4px;font-size:14px;color:#fff"><strong>${extended.length} account${extended.length === 1 ? "" : "s"} healed by the reconcile</strong> — a webhook was missed, so check the Stripe endpoint's subscribed events.</td></tr>`,
      ...extended.map(
        (x) =>
          `<tr><td style="padding:2px 32px;font-size:13px;color:#b8c0cc">${escapeHtml(x.email ?? x.userId)} · ${x.from ? `was ${x.from.slice(0, 10)}` : "had none"} → now ${x.until.slice(0, 10)}</td></tr>`
      )
    );
  }
  rows.push(
    `<tr><td style="padding:18px 32px 24px"><a href="${SITE_URL}/admin/accounts" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Open admin accounts →</a></td></tr>`
  );
  const subject = unmatched.length
    ? `[RiftCompare] ${unmatched.length} paying subscription${unmatched.length === 1 ? "" : "s"} with no account`
    : `[RiftCompare] Premium reconcile healed ${extended.length} account${extended.length === 1 ? "" : "s"}`;
  await sendEmail(
    SUPPORT_EMAIL,
    subject,
    emailShell(
      "Premium billing reconcile",
      rows.join(""),
      `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">Daily Stripe ↔ Premium reconciliation</td></tr>`
    )
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
