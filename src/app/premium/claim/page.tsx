import type { Metadata } from "next";
import Link from "next/link";
import { peekPremiumWinbackTrial } from "@/lib/premium-winback";
import { PremiumWinbackClaimButton } from "@/components/PremiumWinbackClaimButton";
import { SITE_NAME } from "@/lib/site";

// Landing page for the win-back campaign's claim link. Server-side, GET-only,
// and NEVER mutates — it only looks up the token's status. The actual grant
// happens on an explicit click of <PremiumWinbackClaimButton>, which POSTs to
// /api/premium/winback-claim. See lib/premium-winback.ts's header for why a
// GET here must never be the thing that grants (mail-scanner pre-fetch).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim your free Premium days",
  robots: { index: false, follow: false },
};

export default async function PremiumWinbackClaimPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  const { status, days } = token
    ? await peekPremiumWinbackTrial(token)
    : ({ status: "not-found", days: 3 } as const);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="card-surface p-8">
        {status === "not-found" && (
          <>
            <h1 className="text-xl font-extrabold text-white">Link not recognised</h1>
            <p className="mt-2 text-sm text-slate-400">
              This claim link is invalid. If you have an email from us about free Premium days, use the link in that
              email directly rather than a copy of it.
            </p>
          </>
        )}
        {status === "already-claimed" && (
          <>
            <h1 className="text-xl font-extrabold text-white">This link has already been used</h1>
            <p className="mt-2 text-sm text-slate-400">
              Each claim link works once. If that wasn&apos;t you, or your free days already ended, see{" "}
              <Link href="/premium" className="text-brand-400 hover:underline">Premium plans</Link>.
            </p>
          </>
        )}
        {status === "expired" && (
          <>
            <h1 className="text-xl font-extrabold text-white">This link has expired</h1>
            <p className="mt-2 text-sm text-slate-400">
              This offer link is no longer active. You can still see everything Premium unlocks on the{" "}
              <Link href="/premium" className="text-brand-400 hover:underline">Premium page</Link>.
            </p>
          </>
        )}
        {status === "valid" && (
          <>
            <h1 className="text-xl font-extrabold text-white">{days} days of {SITE_NAME} Premium, free</h1>
            <p className="mt-2 text-sm text-slate-400">
              No card required, and there&apos;s nothing to cancel — it just switches on for {days} days and then
              ends on its own. This link works once.
            </p>
            <PremiumWinbackClaimButton days={days} />
          </>
        )}
        <Link href="/" className="btn-ghost mt-6 inline-flex">
          Back to {SITE_NAME}
        </Link>
      </div>
    </div>
  );
}
