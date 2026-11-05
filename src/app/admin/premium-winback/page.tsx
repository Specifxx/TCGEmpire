import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPremiumWinbackAudience, WINBACK_TRIAL_DAYS } from "@/lib/premium-winback";
import { PremiumWinbackConsole, type WinbackConsoleRow } from "@/components/admin/PremiumWinbackConsole";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Premium win-back email",
  robots: { index: false, follow: false },
};

function defaultRegisteredAfter(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}

// The owner's console for the one-off "N days of Premium, free, no card"
// win-back email: choose who gets it, preview the reach, send (batched),
// send yourself a test. See lib/premium-winback.ts for the campaign's rules
// and, importantly, its header comment on why this shape of automatic grant
// was previously removed from the codebase before being reintroduced here.
export default async function PremiumWinbackAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound(); // don't reveal the page exists

  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";
  const registeredAfter = defaultRegisteredAfter();

  let rows: WinbackConsoleRow[] = [];
  let error = false;
  try {
    rows = (await listPremiumWinbackAudience({ registeredAfter })).map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      premiumUntil: r.premiumUntil?.toISOString() ?? null,
      sentAt: r.sentAt?.toISOString() ?? null,
      claimedAt: r.claimedAt?.toISOString() ?? null,
    }));
  } catch {
    error = true;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Premium win-back email</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Premium win-back email</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">
        One-off email to recently-registered free accounts: a single-use link that grants {WINBACK_TRIAL_DAYS} days of
        Premium immediately, no card and no checkout. The grant is automatic the moment the recipient clicks — there
        is nothing to do after sending. Accounts already on Plus/Premium (including mid Stripe trial), admins, seed
        accounts and anyone who opted out of announcements are never emailed, whatever is ticked.
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load the audience right now.
        </div>
      ) : (
        <PremiumWinbackConsole
          rows={rows}
          adminKey={keyOk && !me?.isAdmin ? token : undefined}
          adminEmail={me?.email ?? ""}
          trialDays={WINBACK_TRIAL_DAYS}
        />
      )}
    </div>
  );
}
