import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPremiumOfferAudience, runPremiumOfferBlast, DEFAULT_BATCH, type PremiumOfferResult } from "@/lib/premium-offer";
import { premiumOfferSubject } from "@/lib/email";
import { PLUS_ANNUAL_AMOUNT, PLUS_PRICE_AMOUNT, PREMIUM_ANNUAL_AMOUNT, PREMIUM_PRICE_AMOUNT, premiumEffectiveMonthly } from "@/lib/site";
import { PremiumOfferConsole, type ConsoleRow } from "@/components/admin/PremiumOfferConsole";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Price-drop email",
  robots: { index: false, follow: false },
};

// The owner's console for the one-off price-drop announcement (2026-09-27):
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
        <span className="text-slate-300">Price-drop email</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Price-drop email</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        One-off announcement of the new prices to every account that isn&apos;t paying — free accounts, lapsed
        subscribers and cancelled trialists. Subject: <em>&ldquo;{premiumOfferSubject()}&rdquo;</em>. It quotes Premium at{" "}
        {PREMIUM_PRICE_AMOUNT}/month or {premiumEffectiveMonthly("premium")}/mo billed yearly ({PREMIUM_ANNUAL_AMOUNT}), and
        Plus at {PLUS_PRICE_AMOUNT}/month or {premiumEffectiveMonthly("plus")}/mo billed yearly ({PLUS_ANNUAL_AMOUNT}), with
        four subscribe buttons that open checkout for that exact plan. Active Plus/Premium accounts, admins, seed accounts
        and anyone who opted out of announcements are never emailed, whatever is ticked.
      </p>
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
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Audience", summary.audienceSize ?? 0],
              ["Already sent", summary.alreadySent ?? 0],
              ["Remaining", summary.pending ?? 0],
              ["Opted out", summary.suppressed ?? 0],
              ["Paying (skipped)", summary.paying ?? 0],
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
