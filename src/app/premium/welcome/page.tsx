import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import { isPremium, normalizeTier, PREMIUM_TRIAL_DAYS, subscriptionChargeLine, isIntroCouponId } from "@/lib/premium";
import { sanitizeBackPath, PREMIUM_WELCOME_PATH } from "@/lib/premium-start";
import { TIER_COMPARISON } from "@/components/TierComparisonTable";
import { PremiumActivationPoller } from "@/components/PremiumActivationPoller";
import { TIER_NAMES } from "@/lib/site";

// WHERE STRIPE SENDS A BUYER BACK TO. Replaces /portfolio?upgraded=1, which
// nothing on the site ever read: the buyer landed on the ordinary free-tier
// portfolio, with no confirmation that anything had happened and no route back
// to whatever they were doing when they decided to pay.
//
// Entitlement still comes from the webhook (never from this redirect — a
// success_url is attacker-reachable), so this page proves TWO separate things:
// that the Checkout Session named in the URL really belongs to the signed-in
// viewer, and, by polling /api/me, that the webhook has actually landed.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're in — RiftCompare Premium",
  robots: { index: false, follow: false },
};

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function PremiumWelcomePage({
  searchParams,
}: {
  searchParams: { session_id?: string; back?: string };
}) {
  const sessionId = searchParams.session_id ?? "";
  const back = sanitizeBackPath(searchParams.back);

  const user = await getCurrentUser();
  if (!user) {
    const q = new URLSearchParams();
    if (sessionId) q.set("session_id", sessionId);
    if (back) q.set("back", back);
    redirect(`/login?next=${encodeURIComponent(`${PREMIUM_WELCOME_PATH}?${q.toString()}`)}`);
  }
  if (!sessionId) redirect("/premium");

  // NEVER trust the param alone. Anyone can put any cs_… in this URL; re-reading
  // the session from Stripe and matching it against the signed-in account is
  // what stops this page confirming (or revealing anything about) someone else's
  // purchase.
  let tier: "plus" | "premium" = "premium";
  let trial = false;
  // The dated trial timeline (2026-09-24): every date and amount is read from
  // the subscription Checkout just created — never PREMIUM_TRIAL_DAYS
  // arithmetic — so it cannot disagree with what Stripe will do.
  let timeline: { endsAt: Date; charge: string | null } | null = null;
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription", "subscription.items.data.price"] });
    const ownerId = s.metadata?.userId ?? s.client_reference_id;
    if (s.metadata?.kind !== "premium" || ownerId !== user.id) redirect("/premium");
    tier = normalizeTier(s.metadata?.tier);
    trial = s.metadata?.trial === "1";
    const sub = typeof s.subscription === "object" ? (s.subscription as Stripe.Subscription | null) : null;
    if (trial && sub?.trial_end) {
      const price = sub.items.data[0]?.price as Stripe.Price | undefined;
      const coupon = sub.discount?.coupon;
      const interval = price?.recurring?.interval;
      timeline = {
        endsAt: new Date(sub.trial_end * 1000),
        charge: subscriptionChargeLine({
          unitAmount: price?.unit_amount ?? null,
          currency: price?.currency ?? null,
          interval: interval === "month" || interval === "year" ? interval : null,
          introAmountOff: coupon && isIntroCouponId(coupon.id) ? coupon.amount_off ?? 0 : 0,
        }),
      };
    }
  } catch (e) {
    // redirect() throws a control-flow signal that must not be swallowed here.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    redirect("/premium");
  }

  const tierName = TIER_NAMES[tier];
  // What this tier actually unlocks over a free account — read off the same
  // TIER_COMPARISON rows /premium and the upsell dialog render, so this page
  // can't drift into promising something the table doesn't.
  const unlocked = TIER_COMPARISON.filter((r) => r[tier] !== r.account).map((r) => ({
    feature: r.feature,
    // "Full list + only my cards", "Up to 25", "Store-by-store plan" — the
    // honest size of what unlocked, where a bare feature name would overstate it.
    detail: typeof r[tier] === "string" ? (r[tier] as string) : null,
  }));
  // Where to go first: the 2026-09-25 lineup's tools, and only the ones this
  // tier opens — a Plus member is never handed a link into a Premium wall.
  const firstStops: { href: string; label: string }[] = [
    { href: "/watching", label: "Set a target price" },
    { href: "/tools/deal-finder?mine=watch", label: "Deal Finder: only my cards" },
    { href: "/tools/rising", label: "Rising Cards" },
    ...(tier === "premium"
      ? [
          { href: "/tools/best-basket?source=watchlist", label: "Buy my watchlist for less" },
          { href: "/tools/demand", label: "Demand Finder" },
        ]
      : []),
  ];

  const done = (
    <div className="card-surface p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-400">Welcome to {tierName}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-white">You&apos;re on {tierName} ✓</h1>
      {/* The trial as three dated lines, not an undated "cancel any time"
          beside a Manage button — the page where 3 of the first 6 intro-era
          trialists switched renewal off within the hour. Manage stays below,
          at the same weight: cancelling is still one click. */}
      {trial && timeline ? (
        <ol className="mt-3 space-y-1.5 text-sm text-slate-300" data-trial-timeline>
          <li>
            <span className="font-semibold text-white">Today</span> — full {tierName}, nothing charged.
          </li>
          <li>
            <span className="font-semibold text-white">By {fmtDay(new Date(timeline.endsAt.getTime() - 86_400_000))}</span> — we
            email you a reminder.
          </li>
          <li>
            <span className="font-semibold text-white">{fmtDay(timeline.endsAt)}</span> — {timeline.charge ?? "your plan starts"}, unless
            you cancel before then.
          </li>
        </ol>
      ) : trial && PREMIUM_TRIAL_DAYS > 0 ? (
        <p className="mt-2 text-sm text-slate-300">
          Your free trial has started. We&apos;ll email you a day or two before it converts, and you can cancel any
          time from your account page.
        </p>
      ) : null}
      {unlocked.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold text-white">Just unlocked</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {unlocked.map((f) => (
              <li key={f.feature} className="flex items-start gap-2">
                <span aria-hidden className="font-bold text-brand-400">✓</span>
                <span>
                  {f.feature}
                  {f.detail && <span className="text-slate-500"> · {f.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {firstStops.map((s) => (
          <Link key={s.href} href={s.href} className="btn-ghost text-xs">
            {s.label} →
          </Link>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {/* /dashboard, not the /tools SEO hub — a new member should land on
            their own tools, named by the tier they actually bought. */}
        <Link href={back ?? "/dashboard"} className="btn-primary w-full py-3 text-center text-base">
          {back ? "← Back to what you were doing" : `Open your ${tierName} tools →`}
        </Link>
        <Link href="/premium" className="btn-ghost w-full text-center text-sm">
          Manage your subscription
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      {isPremium(user) ? done : <PremiumActivationPoller trial={trial}>{done}</PremiumActivationPoller>}
    </div>
  );
}
