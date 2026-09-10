import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPremiumOfferAudience, PREMIUM_OFFER_DAYS } from "@/lib/premium-offer";
import { PREMIUM_TRIAL_DAYS } from "@/lib/premium";
import { PremiumOfferConsole, type ConsoleRow } from "@/components/admin/PremiumOfferConsole";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Premium offer email",
  robots: { index: false, follow: false },
};

// The owner's console for the one-off "a full month of Premium, on us" email:
// choose who gets it, preview the reach, send (batched), send yourself a test,
// and — once someone subscribes — grant the promised extra days from the same
// row. See lib/premium-offer.ts for the offer and its rules.
export default async function PremiumOfferAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  let rows: ConsoleRow[] = [];
  let error = false;
  try {
    rows = (await listPremiumOfferAudience()).map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      premiumUntil: r.premiumUntil?.toISOString() ?? null,
      offerSentAt: r.offerSentAt?.toISOString() ?? null,
      clickedOfferAt: r.clickedOfferAt?.toISOString() ?? null,
    }));
  } catch {
    error = true;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Premium offer email</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Premium offer email</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        One-off email to free-tier accounts: subscribe before a date you set and their trial is extended to a full{" "}
        {PREMIUM_OFFER_DAYS} days. The extension is yours to apply — once a row shows <em>Premium</em>, use its grant
        buttons ({PREMIUM_OFFER_DAYS - PREMIUM_TRIAL_DAYS} days if Stripe already gave them the {PREMIUM_TRIAL_DAYS}-day
        trial, {PREMIUM_OFFER_DAYS} if they had none). Accounts that are already Premium, admins and anyone who opted out
        of announcements are never emailed, whatever is ticked.
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load the audience right now.
        </div>
      ) : (
        <PremiumOfferConsole
          rows={rows}
          adminKey={keyOk && !me?.isAdmin ? token : undefined}
          adminEmail={me?.email ?? ""}
          trialDays={PREMIUM_TRIAL_DAYS}
          offerDays={PREMIUM_OFFER_DAYS}
        />
      )}
    </div>
  );
}
