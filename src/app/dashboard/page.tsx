import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled, premiumPlusEnabled, premiumTierOf, getPortfolio } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { TIER_NAMES, tierMonthlyAmount, PREMIUM_PRICE_PERIOD, type PremiumTierKey } from "@/lib/site";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";

export const dynamic = "force-dynamic";

// Members-only hub — noindex (it's behind auth and has no SEO value).
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// `tier` is the MINIMUM tier that can open the tool, and it must match the
// tool page's own gate exactly — the four `"premium"` entries below are the
// four pages that call isPremium(user, "premium"). This list is what a Plus
// member is shown as theirs, so a mismatch either dangles a tool that bounces
// them to /premium or hides one they've paid for. tests/premium-tiers.test.ts
// checks the pairing against TIER_COMPARISON.
const TOOLS: { title: string; desc: string; href: string; icon: string; tier: PremiumTierKey }[] = [
  { title: "Bulk Pricer", desc: "Price a whole want-list or trade pile in one paste.", href: "/bulk-pricer", icon: "📋", tier: "premium" },
  { title: "Best Basket", desc: "The cheapest multi-store cart for a whole deck list.", href: "/tools/best-basket", icon: "🧺", tier: "premium" },
  { title: "Value Finder", desc: "Cards trading below their recent average — undervalued picks.", href: "/tools/value-finder", icon: "🔎", tier: "premium" },
  { title: "Rising Cards", desc: "Cards ranked by demand + price-timing signals — likely to go up soon.", href: "/tools/rising", icon: "🚀", tier: "plus" },
  { title: "Rising Sealed", desc: "Sealed products ranked by price-timing + supply signals — likely to go up soon.", href: "/tools/rising-sealed", icon: "📦", tier: "plus" },
  { title: "Demand Finder", desc: "The most searched and viewed cards right now, by real traffic.", href: "/tools/demand", icon: "📊", tier: "premium" },
  { title: "Deal Finder", desc: "Cards worth more on eBay and the cheapest eBay buys, updated daily.", href: "/tools/deal-finder", icon: "⚖️", tier: "plus" },
  { title: "Condition Calculator", desc: "Estimate a card's value swap between NM, LP, MP, HP and DMG.", href: "/tools/condition-calculator", icon: "🩹", tier: "plus" },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  if (!isPremium(user)) redirect("/premium");

  const country = getCountry();
  const info = COUNTRIES[country];
  const portfolio = await getPortfolio(user.id, country).catch(() => null);
  const hasValue = !!portfolio && portfolio.totalCents > 0;

  // premiumTierOf reads admins as "premium"; the redirect above guarantees a
  // tier here, so the ?? is only for the type.
  const tier = premiumTierOf(user) ?? "premium";
  const tierName = TIER_NAMES[tier];
  const isPlus = tier === "plus";
  const myTools = TOOLS.filter((t) => t.tier === "plus" || !isPlus);
  const lockedTools = isPlus ? TOOLS.filter((t) => t.tier === "premium") : [];
  const canUpgrade = isPlus && premiumPlusEnabled();

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Welcome back, {user.displayName}</h1>
            <span
              className={`chip text-[10px] font-bold uppercase tracking-wider ${
                isPlus ? "bg-slate-500/15 text-slate-200" : "bg-gold/15 text-gold"
              }`}
            >
              {tierName}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Your {tierName} hub — tools, portfolio and the market at a glance.
          </p>
        </div>
        {premiumCheckoutEnabled() && <ManageSubscriptionButton />}
      </div>

      {/* Portfolio snapshot */}
      <div className="card-surface mt-6 flex flex-wrap items-center justify-between gap-4 border-l-2 border-brand-500 p-5">
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

      {/* Tools the member actually has */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Your {tierName} tools</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {myTools.map((t) => (
          <Link
            key={t.title}
            href={t.href}
            className="card-surface group flex flex-col gap-2 border-l-2 border-gold/40 p-4 transition-colors hover:border-gold hover:bg-ink-800"
          >
            <span className="text-2xl" aria-hidden>{t.icon}</span>
            <h3 className="font-bold text-white group-hover:text-gold">{t.title}</h3>
            <p className="flex-1 text-sm leading-relaxed text-slate-400">{t.desc}</p>
            <span className="text-sm font-semibold text-gold">Open →</span>
          </Link>
        ))}
      </div>

      {/* Premium-only tools, shown to Plus as locked rather than hidden: a card
          that bounces you to an upsell wall is worse than one that says up front
          it isn't yours. Not links — nothing here navigates. */}
      {lockedTools.length > 0 && (
        <>
          <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-extrabold text-white">Premium tools</h2>
            {canUpgrade && (
              <Link href="/premium#top-pricing" className="text-sm font-semibold text-gold hover:underline">
                Upgrade to Premium — {tierMonthlyAmount("premium")}/{PREMIUM_PRICE_PERIOD} →
              </Link>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {lockedTools.map((t) => (
              <div key={t.title} className="card-surface flex flex-col gap-2 border-l-2 border-ink-700 p-4 opacity-70">
                <span className="text-2xl grayscale" aria-hidden>{t.icon}</span>
                <h3 className="font-bold text-slate-300">{t.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-slate-500">{t.desc}</p>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">🔒 Premium</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Market & account quick links */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Market &amp; account</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/movers" className="btn-ghost">Price movers</Link>
        <Link href="/market" className="btn-ghost">RiftCompare Index</Link>
        <Link href="/browse" className="btn-ghost">Browse cards</Link>
        <Link href="/premium" className="btn-ghost">Membership</Link>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Ad-free is active across the site while you&apos;re {tierName}. Thanks for supporting RiftCompare.
      </p>
    </div>
  );
}
