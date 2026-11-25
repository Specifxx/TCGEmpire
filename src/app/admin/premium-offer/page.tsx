import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPremiumOfferAudience, loadEmailDeals, premiumOfferArmRead, runPremiumOfferBlast, DEFAULT_BATCH, type PremiumOfferArmRead, type PremiumOfferResult } from "@/lib/premium-offer";
import { buildPremiumOfferEmail, premiumOfferSubject, type PremiumEmailDeal } from "@/lib/email";
import { listPremiumWinbackAudience, WINBACK_TRIAL_DAYS } from "@/lib/premium-winback";
import { PremiumWinbackConsole, type WinbackConsoleRow } from "@/components/admin/PremiumWinbackConsole";
import { PREMIUM_ANNUAL_AMOUNT, PREMIUM_PRICE_AMOUNT } from "@/lib/site";
import { PremiumOfferConsole, type ConsoleRow } from "@/components/admin/PremiumOfferConsole";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Premium email",
  robots: { index: false, follow: false },
};

// The owner's ONE page for Premium email (2026-11-21, owner: "one page where I can
// send a premium ad … newest members first"): the Premium showcase email with its
// live Deal Finder snippet, drawn here exactly as it sends, and below it the
// free-days win-back link email (lib/premium-winback.ts), which used to be its own
// page (/admin/premium-winback still works). Before that this was the feedback +
// Premium email (2026-10-27; the free-trial
// promotion of 2026-10-12 and the price-drop announcement of 2026-09-27 before it):
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
  let deals: PremiumEmailDeal[] = [];
  let winbackRows: WinbackConsoleRow[] = [];
  let winbackError = false;
  const winbackAfter = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [dealsRead, winbackRead] = await Promise.all([
    loadEmailDeals(),
    listPremiumWinbackAudience({ registeredAfter: winbackAfter }).catch(() => null),
  ]);
  deals = dealsRead;
  if (winbackRead) {
    winbackRows = winbackRead.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      premiumUntil: r.premiumUntil?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      claimedAt: r.claimedAt?.toISOString() ?? null,
    }));
  } else winbackError = true;
  // The email exactly as it sends (a dummy unsubscribe link), for the preview frame.
  const previewHtml = buildPremiumOfferEmail({ displayName: me?.displayName ?? "Bill", unsubUrl: "#", deals }).html;
  let armRead: PremiumOfferArmRead[] = [];
  try {
    // The dry run reads every account (not just the table's 1,000 newest) with
    // the exact rule the send applies, so these counts are the real reach.
    const [list, dry] = await Promise.all([listPremiumOfferAudience(), runPremiumOfferBlast({ dryRun: true })]);
    summary = dry;
    armRead = premiumOfferArmRead(list);
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
        <span className="text-slate-300">Premium email</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Premium email</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        The Premium showcase email to every account that is not paying, <strong className="text-slate-200">newest members first</strong>.
        Subject test: half of each batch gets A <em>&ldquo;{premiumOfferSubject("a", deals)}&rdquo;</em>, half gets B{" "}
        <em>&ldquo;{premiumOfferSubject("b", deals)}&rdquo;</em>. It shows today&apos;s top Deal Finder rows (real US store prices
        below TCGplayer market, read when the batch sends), lists what Premium includes, and offers it at {PREMIUM_PRICE_AMOUNT}/month
        or {PREMIUM_ANNUAL_AMOUNT}/year, each button opening checkout for that plan. No trial and no affiliate links. Never emailed,
        whatever is ticked: paying accounts, admins, seed accounts and anyone who opted out of announcements. Accounts that got an
        earlier campaign can get this one, once.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">
        How to run it: <strong className="text-slate-200">send yourself a test</strong>, check it in your inbox, then{" "}
        <strong className="text-slate-200">send next batch</strong>. Each batch is the {DEFAULT_BATCH} newest accounts not yet emailed
        (under Brevo&apos;s 300-a-day free cap); press it again (up to three times a day) until <em>remaining</em> is 0. Nobody is
        emailed twice.
      </p>

      <details className="mt-5 card-surface p-4" open>
        <summary className="cursor-pointer text-sm font-extrabold text-white">
          What it looks like {deals.length ? `(with today's ${deals.length} deals)` : "(no deals read right now: it sends without the snippet)"}
        </summary>
        <iframe title="Premium email preview" srcDoc={previewHtml} sandbox="" className="mt-3 h-[900px] w-full rounded-lg border border-ink-700 bg-[#0b0e14]" />
      </details>

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
          <div className="mt-4 card-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Subject test, so far</p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1">Subject</th>
                  <th className="py-1">Sent</th>
                  <th className="py-1">Clicked a link</th>
                  <th className="py-1">Premium now</th>
                </tr>
              </thead>
              <tbody>
                {armRead.map((r) => (
                  <tr key={r.arm} className="text-slate-200">
                    <td className="py-1 font-bold uppercase">{r.arm}</td>
                    <td className="num py-1">{r.sent}</td>
                    <td className="num py-1">
                      {r.clicked}
                      {r.sent ? ` (${((r.clicked / r.sent) * 100).toFixed(1)}%)` : ""}
                    </td>
                    <td className="num py-1">{r.paying}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Each account&apos;s subject is fixed by its id. Read by the Premium team on Mondays.</p>
          </div>
          <PremiumOfferConsole
            rows={rows}
            adminKey={keyOk && !me?.isAdmin ? token : undefined}
            adminEmail={me?.email ?? ""}
            pendingTotal={summary.pending ?? 0}
            batch={DEFAULT_BATCH}
          />
        </>
      )}

      <section className="mt-12 border-t border-ink-800 pt-8">
        <h2 className="text-lg font-bold text-white">Win-back link email (free Premium days)</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          A separate one-off email to recently registered free accounts: a single-use link that grants {WINBACK_TRIAL_DAYS} days of
          Premium the moment they click, no card. Same exclusions as above. Use one or the other for an account, not both on one day.
        </p>
        {winbackError ? (
          <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            Couldn&apos;t load the win-back audience right now.
          </div>
        ) : (
          <PremiumWinbackConsole
            rows={winbackRows}
            adminKey={keyOk && !me?.isAdmin ? token : undefined}
            adminEmail={me?.email ?? ""}
            trialDays={WINBACK_TRIAL_DAYS}
          />
        )}
      </section>
    </div>
  );
}
