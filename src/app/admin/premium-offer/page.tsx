import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPremiumOfferAudience, runPremiumOfferBlast, DEFAULT_BATCH, type PremiumOfferResult } from "@/lib/premium-offer";
import { premiumOfferSubject } from "@/lib/email";
import { PLUS_PRICE_AMOUNT, PREMIUM_PRICE_AMOUNT, trialDaysPhrase, PLUS_ON_SALE } from "@/lib/site";
import { PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS, premiumTrialEnabled } from "@/lib/premium";
import { PremiumOfferConsole, type ConsoleRow } from "@/components/admin/PremiumOfferConsole";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Trial promo email",
  robots: { index: false, follow: false },
};

// The owner's console for the free-trial promotion (2026-10-12; the one-off
// price-drop announcement of 2026-09-27 before it):
// the reach before anything is sent (a dry run on every page load: audience,
// already sent, remaining, opted out), a test send to one inbox, and the
// batched send. Until 2026-09-27 this page ran the "month on us" offer; see
// lib/premium-offer.ts for the audience and its rules.
export default async function PremiumOfferAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  let rows: ConsoleRow[] = [];
  let summary: PremiumOfferResult | null = null;
  let error = false;
  try {
    // The dry run reads every account (not just the table's 1,000 newest) with
    // the exact rule the send applies, so these counts are the real reach.
    const [list, dry] = await Promise.all([listPremiumOfferAudience(), runPremiumOfferBlast({ dryRun: true })]);
    summary = dry;
    rows = list.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      premiumUntil: r.premiumUntil?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      clickedAt: r.clickedAt?.toISOString() ?? null,
    }));
  } catch {
    error = true;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Trial promo email</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Trial promo email: subscribe now, {trialDaysPhrase(PREMIUM_TRIAL_DAYS)} free</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        One email to every account that could still start a trial. Subject:{" "}
        <em>&ldquo;{premiumOfferSubject()}&rdquo;</em>. It offers {PLUS_ON_SALE ? "Pro and Plus" : "Pro (Plus is off sale)"} free for{" "}
        {trialDaysPhrase(PREMIUM_TRIAL_DAYS)}, then {PREMIUM_PRICE_AMOUNT}/month{PLUS_ON_SALE ? ` or ${PLUS_PRICE_AMOUNT}/month` : ""} (yearly
        button too), says a card is required and that we email before the trial ends. Every button opens checkout for
        that exact plan. Never emailed, whatever is ticked: paying accounts, anyone who already had a trial or has paid
        before (checkout would not give them one), admins, seed accounts and anyone who opted out of announcements.
        Accounts that got September&apos;s price-drop email can get this one.
      </p>
      {!(premiumTrialEnabled() && PREMIUM_TRIAL_FEE_CENTS === 0) && (
        <p className="mt-2 max-w-3xl rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          The trial is not free in this deployment (PREMIUM_TRIAL_DAYS / PREMIUM_TRIAL_FEE_CENTS in Vercel), so
          sending is blocked: the email would promise a trial checkout won&apos;t give. Remove those two variables and redeploy.
        </p>
      )}
      <p className="mt-2 max-w-3xl text-sm text-slate-400">
        How to run it: <strong className="text-slate-200">send yourself a test</strong>, check it in your inbox, then{" "}
        <strong className="text-slate-200">send to all pending</strong>. Each send goes out in a batch of {DEFAULT_BATCH}{" "}
        (under Brevo&apos;s 300-a-day free cap); press send again the next day until <em>remaining</em> is 0. Nobody is
        emailed twice.
      </p>

      {error || !summary ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load the audience right now.
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
            {[
              ["Audience", summary.audienceSize ?? 0],
              ["Already sent", summary.alreadySent ?? 0],
              ["Remaining", summary.pending ?? 0],
              ["Opted out", summary.suppressed ?? 0],
              ["Paying (skipped)", summary.paying ?? 0],
              ["Had a trial (skipped)", summary.hadTrial ?? 0],
            ].map(([label, n]) => (
              <div key={label} className="card-surface p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="num mt-1 text-xl font-bold text-white">{n}</dd>
              </div>
            ))}
          </dl>
          <PremiumOfferConsole
            rows={rows}
            adminKey={keyOk && !me?.isAdmin ? token : undefined}
            adminEmail={me?.email ?? ""}
            pendingTotal={summary.pending ?? 0}
            batch={DEFAULT_BATCH}
          />
        </>
      )}
    </div>
  );
}
