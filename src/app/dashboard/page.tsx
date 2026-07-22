import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled, getPortfolio } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";

export const dynamic = "force-dynamic";

// Members-only hub — noindex (it's behind auth and has no SEO value).
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const TOOLS = [
  { title: "Best Basket", desc: "The cheapest multi-store cart for a whole deck list.", href: "/tools/best-basket", icon: "🧺" },
  { title: "Value Finder", desc: "Cards trading below their recent average — undervalued picks.", href: "/tools/value-finder", icon: "🔎" },
  { title: "Rising Cards", desc: "Cards ranked by demand + price-timing signals — likely to go up soon.", href: "/tools/rising", icon: "🚀" },
  { title: "Deal Finder", desc: "Cards worth more on eBay and the cheapest eBay buys, updated daily.", href: "/tools/arbitrage", icon: "⚖️" },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  if (!isPremium(user)) redirect("/premium");

  const country = getCountry();
  const info = COUNTRIES[country];
  const portfolio = await getPortfolio(user.id, country).catch(() => null);
  const hasValue = !!portfolio && portfolio.totalCents > 0;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Welcome back, {user.displayName}</h1>
            <span className="chip bg-gold/15 text-[10px] font-bold uppercase tracking-wider text-gold">Premium</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">Your Premium hub — tools, portfolio and the market at a glance.</p>
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

      {/* Premium tools */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Your Premium tools</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {TOOLS.map((t) => (
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

      {/* Market & account quick links */}
      <h2 className="mb-3 mt-8 text-lg font-extrabold text-white">Market &amp; account</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/movers" className="btn-ghost">Price movers</Link>
        <Link href="/market" className="btn-ghost">RiftCompare Index</Link>
        <Link href="/browse" className="btn-ghost">Browse cards</Link>
        <Link href="/premium" className="btn-ghost">Membership</Link>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Ad-free is active across the site while you&apos;re Premium. Thanks for supporting RiftCompare.
      </p>
    </div>
  );
}
