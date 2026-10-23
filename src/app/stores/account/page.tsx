import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { StoreProfileForm } from "@/components/stores/StoreProfileForm";
import { ABOUT_MAX, PROMO_MAX, storePlanStatus, type StorePlanStatus } from "@/lib/store-plan";
import { storeBySlug, storeSlug } from "@/lib/store-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Stores plan",
  robots: { index: false, follow: false }, // a private account page
};

const STATUS_COPY: Record<StorePlanStatus, { label: string; tone: string; body: string }> = {
  "payment-pending": {
    label: "Payment not confirmed",
    tone: "text-gold",
    body: "Stripe hasn't confirmed your first payment yet. This page updates once it does.",
  },
  "awaiting-link": {
    label: "Waiting for us to confirm your store",
    tone: "text-gold",
    body: "We're matching your plan to the store we track, usually within a day. Your private report link arrives by email as soon as it's done.",
  },
  active: { label: "Active", tone: "text-brand-300", body: "" },
  ended: {
    label: "Ended",
    tone: "text-rose-300",
    body: "This plan is no longer paid, so the report and the Verified mark are switched off. Subscribe again any time.",
  },
};

// The Stores plan buyer's own page (lib/store-plan.ts): status, paid-until,
// the report link once the owner has linked the plan, billing, and the text
// shown on their store page. Per-request and scoped to the signed-in account.
export default async function StoreAccountPage({ searchParams }: { searchParams: { welcome?: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-extrabold text-white">Your Stores plan</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in with the account you subscribed with.</p>
        <Link href="/login?next=/stores/account&src=stores_plan" className="btn-primary mt-4 inline-block">
          Sign in →
        </Link>
      </div>
    );
  }

  const plans = await prisma.storePlanSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, storeName: true, storeUrl: true, activeUntil: true, partnerId: true, createdAt: true },
  });
  const partnerIds = plans.map((p) => p.partnerId).filter((id): id is string => !!id);
  const partners = partnerIds.length
    ? await prisma.storePartner.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, name: true, retailer: true, token: true, about: true, promo: true },
      })
    : [];
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-extrabold text-white">Your Stores plan</h1>
      {searchParams.welcome === "1" && (
        <p role="status" className="card-surface mt-4 border border-brand-500/40 p-4 text-sm text-brand-200">
          Thanks for subscribing. We&apos;ll confirm which tracked store is yours within a day and email your private
          report link to {user.email}.
        </p>
      )}

      {plans.length === 0 ? (
        <div className="card-surface mt-6 p-6 text-center text-sm text-slate-400">
          No Stores plan on this account ({user.email}).{" "}
          <Link href="/stores" className="text-brand-400 hover:underline">
            See the plan →
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {plans.map((plan) => {
            const status = storePlanStatus(plan, now);
            const copy = STATUS_COPY[status];
            const partner = plan.partnerId ? partnerById.get(plan.partnerId) : undefined;
            const page = partner ? storeBySlug(storeSlug(partner.retailer)) : undefined;
            return (
              <section key={plan.id} className="card-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-white">{partner?.name ?? plan.storeName}</h2>
                    <p className="break-all text-xs text-slate-500">{plan.storeUrl}</p>
                  </div>
                  <span className={`chip text-xs font-bold ${copy.tone}`}>{copy.label}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Subscribed</dt>
                    <dd className="text-slate-200">{dateFmt.format(plan.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Paid until</dt>
                    <dd className="text-slate-200">{plan.activeUntil ? dateFmt.format(plan.activeUntil) : "—"}</dd>
                  </div>
                </dl>
                {copy.body && <p className="mt-3 text-sm text-slate-400">{copy.body}</p>}

                {partner && status === "active" && (
                  <div className="mt-4 flex flex-col gap-2">
                    <a href={`${SITE_URL}/stores/report?token=${partner.token}`} className="btn-primary self-start text-sm">
                      Open your repricing report →
                    </a>
                    <p className="text-[11px] text-slate-500">
                      The report link is the password: share it only with your team.
                      {page && (
                        <>
                          {" "}
                          Your public page:{" "}
                          <Link href={`/stores/${page.slug}`} className="text-brand-400 hover:underline">
                            /stores/{page.slug}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                )}

                {partner && status === "active" && (
                  <div className="mt-5 border-t border-ink-800 pt-4">
                    <h3 className="mb-2 text-sm font-bold text-white">Your store page</h3>
                    <StoreProfileForm subscriptionId={plan.id} about={partner.about} promo={partner.promo} aboutMax={ABOUT_MAX} promoMax={PROMO_MAX} />
                  </div>
                )}
                {status === "ended" && (
                  <Link href="/stores" className="btn-ghost mt-3 inline-block text-sm">
                    Subscribe again →
                  </Link>
                )}
              </section>
            );
          })}
          <div className="text-center">
            <ManageSubscriptionButton label="Manage billing" back="/stores/account" />
            <p className="mt-1 text-[11px] text-slate-500">Update your card, see invoices or cancel, in Stripe.</p>
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-500">
        Paying for the plan never changes a store&apos;s place in any price comparison.{" "}
        <Link href="/contact" className="text-brand-400 hover:underline">
          Questions?
        </Link>
      </p>
    </div>
  );
}
