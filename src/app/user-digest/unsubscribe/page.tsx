import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SITE_NAME } from "@/lib/site";

// Landing page for the weekly-digest opt-out link. Server-side and idempotent:
// the click itself completes the opt-out, so there's no "confirm" step to fail
// at and nothing to go wrong if the visitor has JS disabled.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe from the weekly digest",
  robots: { index: false, follow: false },
};

export default async function UserDigestUnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";

  let state: "ok" | "already" | "bad" = "bad";
  if (token) {
    const row = await prisma.userDigestOptOut.findUnique({ where: { token } }).catch(() => null);
    if (row) {
      if (row.optedOutAt) state = "already";
      else {
        await prisma.userDigestOptOut
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
              This unsubscribe link is invalid or has expired. If you keep receiving the weekly digest, reply to
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
            <p className="mt-2 text-sm text-slate-400">You won&apos;t get any more weekly digest emails from {SITE_NAME}.</p>
            <p className="mt-3 text-xs text-slate-500">
              This doesn&apos;t affect account emails (password resets, order updates), your price alerts, or
              product announcements — those each have their own unsubscribe.
            </p>
          </>
        )}
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Back to {SITE_NAME}
        </Link>
      </div>
    </div>
  );
}
