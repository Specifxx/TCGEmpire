import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";

// Landing page for the Arbitrage Alerts opt-out link. Server-side and
// idempotent: the click itself completes the opt-out, so there's no "confirm"
// step to fail at and nothing to go wrong if the visitor has JS disabled.
// Mirrors /user-digest/unsubscribe/page.tsx exactly.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe from Arbitrage Alerts",
  robots: { index: false, follow: false },
};

export default async function ArbitrageAlertsUnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";

  let state: "ok" | "already" | "bad" = "bad";
  if (token) {
    const row = await prisma.arbitrageAlertOptOut.findUnique({ where: { token } }).catch(() => null);
    if (row) {
      if (row.optedOutAt) state = "already";
      else {
        await prisma.arbitrageAlertOptOut
          .update({ where: { token }, data: { optedOutAt: new Date() } })
          .catch(() => {});
        state = "ok";
      }
    }
  }

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="card-surface p-8">
        {state === "bad" ? (
          <>
            <h1 className="text-xl font-extrabold text-white">Link not recognised</h1>
            <p className="mt-2 text-sm text-slate-400">
              This unsubscribe link is invalid or has expired. If you keep receiving Arbitrage Alerts, reply to
              the email and we&apos;ll remove you by hand.
            </p>
          </>
        ) : (
          <>
            <div className="text-3xl" aria-hidden>
              ✅
            </div>
            <h1 className="mt-3 text-xl font-extrabold text-white">
              {state === "already" ? "You're already unsubscribed" : "Unsubscribed"}
            </h1>
            <p className="mt-2 text-sm text-slate-400">You won&apos;t get any more Arbitrage Alerts emails from {SITE_NAME}.</p>
            <p className="mt-3 text-xs text-slate-500">
              This only turns off this daily digest — your Premium subscription, account emails, price alerts and
              the weekly digest are unaffected.
            </p>
          </>
        )}
        <Link href="/tools/deal-finder" className="btn-primary mt-6 inline-flex">
          Open Deal Finder
        </Link>
      </div>
    </div>
  );
}
