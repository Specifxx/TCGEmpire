import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Consulting bookings",
  robots: { index: false, follow: false },
};

// The store-consulting pipeline (/stores/consulting).
//
// PENDING ROWS ARE SHOWN, NOT HIDDEN. A `pending` booking is someone who filled
// in the whole form — store name, what they're stuck on, when they're free —
// and then didn't finish Checkout. While this product is new that is the single
// most useful row on the page: a warm lead with their objection already
// written down, and a reason to send one email. Hiding them because they
// haven't paid yet would throw away the best signal here.
const STATUS_STYLE: Record<string, string> = {
  paid: "bg-brand-500/15 text-brand-300",
  scheduled: "bg-gold/15 text-gold",
  completed: "bg-ink-800 text-slate-300",
  pending: "bg-ink-800 text-slate-500",
  refunded: "bg-rose-500/15 text-rose-300",
  cancelled: "bg-ink-800 text-slate-600",
};

export default async function AdminConsultingPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const bookings = await prisma.consultBooking.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });

  // Revenue counts PAID money only — a pending row is interest, not income, and
  // a total that blurred the two would be the kind of number you can't act on.
  const earned = bookings
    .filter((b) => ["paid", "scheduled", "completed"].includes(b.status))
    .reduce((sum, b) => sum + b.amountCents, 0);
  const currency = (bookings[0]?.currency ?? "aud").toUpperCase();
  const awaiting = bookings.filter((b) => b.status === "paid").length;
  const abandoned = bookings.filter((b) => b.status === "pending").length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Consulting bookings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Paid store sessions from{" "}
            <Link href="/stores/consulting" className="text-brand-400 hover:underline">
              /stores/consulting
            </Link>
            .
          </p>
        </div>
        <Link href="/admin" className="btn-ghost text-sm">
          ← Admin
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat label={`Earned (${currency})`} value={formatMoney(earned, currency)} />
        <Stat label="Paid, needs a time" value={String(awaiting)} accent={awaiting > 0} />
        <Stat label="Didn't finish checkout" value={String(abandoned)} />
      </div>

      {bookings.length === 0 ? (
        <div className="card-surface mt-5 p-8 text-center">
          <p className="font-semibold text-white">No bookings yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Rows land here the moment a store submits the form — before they pay, so an abandoned
            checkout is still a lead you can follow up.
          </p>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {bookings.map((b) => (
            <li key={b.id} className="card-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">{b.storeName}</span>
                    <span className={`chip text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[b.status] ?? "bg-ink-800 text-slate-400"}`}>
                      {b.status}
                    </span>
                    <span className="chip bg-ink-800 text-[10px] text-slate-400">{b.country}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    {b.contactName} ·{" "}
                    <a href={`mailto:${b.email}`} className="text-brand-400 hover:underline">
                      {b.email}
                    </a>
                  </div>
                  {b.storeUrl && (
                    <a
                      href={b.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-xs text-slate-500 hover:text-slate-300"
                    >
                      {b.storeUrl}
                    </a>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-sm font-bold text-white">
                    {formatMoney(b.amountCents, b.currency.toUpperCase())}
                  </div>
                  <div className="text-[11px] text-slate-500">{dateFmt.format(b.createdAt)}</div>
                  {b.invoiceUrl && (
                    <a
                      href={b.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-brand-400 hover:underline"
                    >
                      Invoice →
                    </a>
                  )}
                </div>
              </div>

              {b.preferredTimes && (
                <p className="mt-2 text-xs text-slate-400">
                  <span className="text-slate-500">Times:</span> {b.preferredTimes}
                </p>
              )}
              {b.goals && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-ink-950/50 p-3 text-xs leading-relaxed text-slate-300">
                  {b.goals}
                </p>
              )}
              {b.scheduledFor && (
                <p className="mt-2 text-xs text-gold">Scheduled for {dateFmt.format(b.scheduledFor)}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-slate-600">
        Status is moved by hand for now (Prisma Studio or a one-off script): paid → scheduled once a
        time is agreed, → completed after the call. There is one consultant and a calendar he already
        owns, so a scheduling UI here would be a state machine with no second user.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-2xl font-extrabold ${accent ? "text-brand-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
