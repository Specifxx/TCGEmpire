import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { premiumCheckoutEnabled, premiumPlusEnabled, premiumAnnualEnabled, premiumTierOf, getPortfolio } from "@/lib/premium";
import { billingStateFor } from "@/lib/billing-state";
import { planSwitchPriceLabel } from "@/lib/plan-switch-price";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { TIER_NAMES } from "@/lib/site";
import { DASHBOARD_TOOLS, dashboardToolOpens } from "@/lib/dashboard-tools";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { NavIcon } from "@/components/NavIcon";
import { PremiumNavLink } from "@/components/PremiumNavLink";
import { WatchlistSnapshot } from "@/components/WatchlistSnapshot";

export const dynamic = "force-dynamic";

// Members-only hub — noindex (it's behind auth and has no SEO value).
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// The tool list, each tool's minimum tier and its free taste live in
// lib/dashboard-tools.ts (tests/premium-tiers.test.ts runs them).

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const country = getCountry();
  const info = COUNTRIES[country];
  const portfolio = await getPortfolio(user.id, country).catch(() => null);
  const hasValue = !!portfolio && portfolio.totalCents > 0;

  // Free tier included (2026-09-16): a signed-in non-paying visitor gets a
  // reason to come back too — their real portfolio/watchlist, the free taste
  // of every tool as an open link, and an upgrade path, never a wall.
  const tier = premiumTierOf(user);
  const tierName = tier ? TIER_NAMES[tier] : "Free";
  const isPlus = tier === "plus";
  const isFree = tier == null;
  // A Plus member's upgrade quote: not mid-trial (the upgrade route handles
  // paid subscriptions only), and at their own interval — an annual member is
  // billed Premium's yearly price. One memoised Stripe read, Plus only.
  const billing = isPlus ? await billingStateFor(user, true) : { trialing: false, interval: null };
  const tools = DASHBOARD_TOOLS.map((t) => ({ ...t, opens: dashboardToolOpens(t.tier, tier) }));
  // Anything a tier can neither open nor taste would be a lock. None today —
  // every paid tool has a free taste — but a future entry without one must
  // still render honestly rather than as an open link into a wall.
  const lockedTools = tools.filter((t) => !t.opens && !t.freeTaste);
  const canUpgrade = isFree ? premiumCheckoutEnabled() : isPlus && premiumPlusEnabled() && !billing.trialing;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Welcome back, {user.displayName}</h1>
            {/* Gold marks Premium, so the Free chip never wears it
                (2026-09-25); Plus names its headline benefit. */}
            <span
              className={`chip text-[10px] font-bold uppercase tracking-wider ${
                isFree ? "bg-ink-700 text-slate-300" : isPlus ? "bg-slate-500/15 text-slate-200" : "bg-gold/15 text-gold"
              }`}
            >
              {isPlus ? "Plus · ad-free" : tierName}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Your {tierName} hub — tools, portfolio and the market at a glance.
          </p>
        </div>
        {premiumCheckoutEnabled() && <ManageSubscriptionButton />}
      </div>

      {/* Portfolio + watchlist snapshots */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card-surface flex flex-wrap items-center justify-between gap-4 border-l-2 border-brand-500 p-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Collection value ({info.currency})</div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="num text-3xl font-extrabold text-white">
                {hasValue ? formatMoney(portfolio!.totalCents, info.currency) : "—"}
              </span>
              {hasValue && portfolio!.d7 != null && (
                <span className={`num text-sm font-bold ${portfolio!.d7 > 0 ? "text-up" : portfolio!.d7 < 0 ? "text-down" : "text-slate-400"}`}>
                  {portfolio!.d7 > 0 ? "+" : ""}{portfolio!.d7}% · 7d
                </span>
              )}
            </div>
          </div>
          <Link href="/portfolio" className="btn-ghost text-sm">
            {hasValue ? "Open portfolio →" : "Start tracking →"}
          </Link>
        </div>
        {/* Client island — see WatchlistSnapshot's own comment for why. */}
        <WatchlistSnapshot />
      </div>

      {/* Every tool, as an OPEN link wherever this account can use any of it
          (2026-09-25). A tool the tier opens in full says "Open"; a paid tool
          with a free taste says exactly what that taste is ("Top 3 free",
          "See your total free") and names the tier for the rest — never a
          lock, because the free account really can use it. Only a tool with
          neither renders as a lock (lockedTools, empty today). */}
      <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold text-white">{isFree ? "Your tools" : <>Your {tierName} tools</>}</h2>
        {canUpgrade && (
          <PremiumNavLink surface="nav:dashboard" href="/premium#top-pricing" className="text-sm font-semibold text-gold hover:underline">
            {isFree ? "See plans" : `Upgrade to Premium — ${planSwitchPriceLabel("premium", billing.interval, premiumAnnualEnabled())}`} →
          </PremiumNavLink>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tools
          .filter((t) => t.opens || t.freeTaste)
          .map((t) =>
            t.opens ? (
              <Link
                key={t.title}
                href={t.href}
                className="card-surface group flex flex-col gap-2 border-l-2 border-brand-500/40 p-4 transition-colors hover:border-brand-400 hover:bg-ink-800"
              >
                <h3 className="font-bold text-white group-hover:text-brand-300">{t.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-slate-400">{t.desc}</p>
                <span className="text-sm font-semibold text-brand-400">Open →</span>
              </Link>
            ) : (
              <Link
                key={t.title}
                href={t.href}
                className="card-surface group flex flex-col gap-2 border-l-2 border-ink-700 p-4 transition-colors hover:border-brand-400 hover:bg-ink-800"
              >
                <h3 className="font-bold text-white group-hover:text-brand-300">{t.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-slate-400">{t.desc}</p>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-brand-400">{t.freeTaste} →</span>
                  {t.tier !== "free" && (
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Full {t.tier === "plus" ? "list" : "plan"}: {TIER_NAMES[t.tier]}
                    </span>
                  )}
                </span>
              </Link>
            )
          )}
        {lockedTools.map((t) => (
          <div key={t.title} className="card-surface flex flex-col gap-2 border-l-2 border-ink-700 p-4 opacity-70">
            <h3 className="font-bold text-slate-300">{t.title}</h3>
            <p className="flex-1 text-sm leading-relaxed text-slate-500">{t.desc}</p>
            <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <NavIcon name="lock" className="h-3.5 w-3.5" />
              {t.tier === "free" ? "Free" : TIER_NAMES[t.tier]}
            </span>
          </div>
        ))}
      </div>
      {isPlus && billing.trialing && (
        <p className="mt-2 text-xs text-slate-500">
          Plan changes open once your free trial has converted — Premium&apos;s store-by-store plan is one click from{" "}
          <Link href="/premium" className="text-slate-400 hover:underline">your membership page</Link> then.
        </p>
      )}

      {/* Market & account quick links */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Market &amp; account</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/movers" className="btn-ghost">Price movers</Link>
        <Link href="/market" className="btn-ghost">RiftCompare Index</Link>
        <Link href="/browse" className="btn-ghost">Card database</Link>
        <Link href="/premium" className="btn-ghost">Membership</Link>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        {isFree ? (
          "Free, always — watchlist, portfolio and price alerts, no card required."
        ) : (
          <>Thanks for supporting RiftCompare — your {tierName} plan is what keeps price comparison free for everyone.</>
        )}
      </p>
    </div>
  );
}
