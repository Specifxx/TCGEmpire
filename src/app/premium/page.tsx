import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled, premiumTrialEnabled } from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";
import { SITE_URL, PREMIUM_PRICE_LABEL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — power tools for buyers & flippers",
  description:
    "RiftCompare Premium: the Best-Basket optimiser (cheapest multi-store cart), the Value Finder screener and an ad-free site — for about the price of a booster pack a month. The portfolio tracker stays free.",
  alternates: { canonical: "/premium" },
};

// Each Premium feature, with where to go once you've unlocked it. Features without
// a destination (ad-free, supporting the site) show "✓ Active" instead of a link.
const FEATURES: { title: string; body: string; href: string | null; cta: string | null }[] = [
  {
    title: "Best-Basket optimiser",
    body: "The cheapest way to actually buy a whole deck or wishlist — the smartest split across stores once postage and free-shipping thresholds are in.",
    href: "/tools/best-basket",
    cta: "Open Best Basket",
  },
  {
    title: "Value Finder",
    body: "A screener for cards trading below their own recent average — spot undervalued cards before they bounce back.",
    href: "/tools/value-finder",
    cta: "Open Value Finder",
  },
  {
    title: "Ad-free everywhere",
    body: "No ads on any page while you're Premium — it's automatic, nothing to switch on.",
    href: null,
    cta: null,
  },
  {
    title: "You keep RiftCompare independent",
    body: "Premium pays for the servers and the price data, and keeps the core — including the portfolio tracker — free for everyone.",
    href: null,
    cta: null,
  },
];

export default async function PremiumPage() {
  const user = await getCurrentUser();
  const already = isPremium(user); // session user carries premiumUntil + isAdmin
  const checkoutLive = premiumCheckoutEnabled();
  // Trial eligible = signed in, not already Premium, and never trialed before.
  const dbUser = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { trialStartedAt: true } }) : null;
  const trialEligible = premiumTrialEnabled() && !!user && !already && !dbUser?.trialStartedAt;

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "RiftCompare Premium",
            description: "The Best-Basket optimiser, the Value Finder screener and an ad-free RiftCompare.",
            brand: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
          }),
        }}
      />

      <div className="card-surface overflow-hidden">
        <div className="border-l-2 border-brand-500 bg-ink-900 px-6 py-10 text-center">
          <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">Premium</span>
          {already ? (
            <>
              <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">You&apos;re Premium</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
                Here&apos;s everything you&apos;ve unlocked — jump straight into any of it below. Thanks for supporting RiftCompare.
              </p>
            </>
          ) : (
            <>
              <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">Power tools for buyers &amp; flippers</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
                The portfolio tracker and price comparison stay <strong className="text-white">free</strong>. Premium adds the
                power tools — for about the price of one booster pack a month — and keeps RiftCompare independent.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="card-surface flex flex-col border-l-2 border-brand-500 p-4">
            <h2 className="font-bold text-white">{f.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{f.body}</p>
            {already &&
              (f.href ? (
                <Link href={f.href} className="btn-primary mt-3 self-start text-sm">{f.cta} →</Link>
              ) : (
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-400">✓ Active</span>
              ))}
          </div>
        ))}

        {!already && (
          <div className="card-surface grid place-items-center border-gold/30 p-4 text-center">
            <div>
              {PREMIUM_PRICE_LABEL && <p className="num mb-2 text-2xl font-extrabold text-white">{PREMIUM_PRICE_LABEL}</p>}
              <PremiumCta checkoutLive={checkoutLive} signedIn={!!user} trialEligible={trialEligible} priceLabel={PREMIUM_PRICE_LABEL} />
            </div>
          </div>
        )}
      </div>

      {already && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          <Link href="/portfolio" className="btn-ghost">Portfolio</Link>
          <Link href="/tools/arbitrage" className="btn-ghost">Arbitrage</Link>
          <Link href="/movers" className="btn-ghost">Movers</Link>
          <Link href="/market" className="btn-ghost">Market Index</Link>
          {checkoutLive && <ManageSubscriptionButton />}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        {already ? (
          <>Update your card or cancel anytime via “Manage subscription” above. Questions? </>
        ) : trialEligible ? (
          <>Your 1-day free trial needs a card and converts to a paid plan after 24 hours unless you cancel first — cancel anytime from this page. Questions? </>
        ) : (
          <>Cancel anytime — your benefits run to the end of the paid period. Questions? </>
        )}
        <Link href="/contact" className="text-brand-400 hover:underline">Get in touch</Link>.
      </p>
    </div>
  );
}
