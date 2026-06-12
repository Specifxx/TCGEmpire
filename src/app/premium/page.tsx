import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isPremium, premiumCheckoutEnabled } from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RiftCompare Premium — track your collection like a portfolio",
  description:
    "RiftCompare Premium: daily collection value history, CSV exports, unlimited price alerts and an ad-free site — for the price of a booster pack a month.",
  alternates: { canonical: "/premium" },
};

const FEATURES = [
  { emoji: "📈", title: "Collection value history", body: "Your binder, charted like a portfolio — daily value snapshots in your market, with 1/7/30-day moves." },
  { emoji: "⬇️", title: "CSV exports", body: "Download your whole collection with live condition-adjusted values — for insurance, trades or spreadsheets." },
  { emoji: "🔔", title: "Unlimited price alerts", body: "Watch as many cards as you like; we email the moment one drops." },
  { emoji: "🚫", title: "Ad-free everywhere", body: "No ads on any page while you're Premium." },
  { emoji: "🏆", title: "Founding-member badge", body: "A permanent mark on your profile and the leaderboards." },
];

export default async function PremiumPage() {
  const user = await getCurrentUser();
  const dbUser = user
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { premiumUntil: true } })
    : null;
  const already = isPremium(dbUser);
  const checkoutLive = premiumCheckoutEnabled();

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "RiftCompare Premium",
            description: "Collection value tracking, CSV exports, unlimited price alerts and an ad-free RiftCompare.",
            brand: { "@type": "Organization", name: "RiftCompare", url: SITE_URL },
          }),
        }}
      />

      <div className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-gold/20 via-ink-850 to-brand-600/15 px-6 py-10 text-center">
          <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">★ Premium</span>
          <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">
            Track your collection like a portfolio
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            Everything free stays free — Premium adds the power tools, for about the price of one
            booster pack a month. It also keeps RiftCompare independent and running.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title} className="card-surface p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold/10 text-lg" aria-hidden>{f.emoji}</span>
              <h2 className="font-bold text-white">{f.title}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
          </div>
        ))}
        <div className="card-surface grid place-items-center border-gold/30 p-4 text-center">
          {already ? (
            <div>
              <p className="text-lg font-extrabold text-gold">You&apos;re Premium ★</p>
              <Link href="/portfolio" className="btn-primary mt-3 text-sm">Open your portfolio →</Link>
            </div>
          ) : (
            <PremiumCta checkoutLive={checkoutLive} signedIn={!!user} />
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Cancel anytime — your benefits run to the end of the paid period. Questions?{" "}
        <Link href="/contact" className="text-brand-400 hover:underline">Get in touch</Link>.
      </p>
    </div>
  );
}
