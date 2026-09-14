import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { isPremium, normalizeTier, PREMIUM_TRIAL_DAYS } from "@/lib/premium";
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
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId);
    const ownerId = s.metadata?.userId ?? s.client_reference_id;
    if (s.metadata?.kind !== "premium" || ownerId !== user.id) redirect("/premium");
    tier = normalizeTier(s.metadata?.tier);
    trial = s.metadata?.trial === "1";
  } catch (e) {
    // redirect() throws a control-flow signal that must not be swallowed here.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    redirect("/premium");
  }

  const tierName = TIER_NAMES[tier];
  // What this tier actually unlocks over a free account — read off the same
  // TIER_COMPARISON rows /premium and the upsell dialog render, so this page
  // can't drift into promising something the table doesn't.
  const unlocked = TIER_COMPARISON.filter((r) => r[tier] !== r.account).map((r) => r.feature);

  const done = (
    <div className="card-surface p-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-400">Welcome to {tierName}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-white">You&apos;re on {tierName} ✓</h1>
      {trial && PREMIUM_TRIAL_DAYS > 0 && (
        <p className="mt-2 text-sm text-slate-300">
          Your {PREMIUM_TRIAL_DAYS}-day free trial has started. We&apos;ll email you before it converts, and you
          can cancel any time from your account page.
        </p>
      )}
      {unlocked.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold text-white">Just unlocked</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {unlocked.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span aria-hidden className="font-bold text-brand-400">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <Link href={back ?? "/tools"} className="btn-primary w-full py-3 text-center text-base">
          {back ? "← Back to what you were doing" : "Open your tools →"}
        </Link>
        <Link href="/premium" className="btn-ghost w-full text-center text-sm">
          Manage your subscription
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      {isPremium(user) ? done : <PremiumActivationPoller>{done}</PremiumActivationPoller>}
    </div>
  );
}
