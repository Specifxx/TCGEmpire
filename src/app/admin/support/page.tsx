import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { AdminSupportRow } from "@/components/AdminSupportRow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support tickets",
  robots: { index: false, follow: false },
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-gold/15 text-gold",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300",
  RESOLVED: "bg-brand-500/15 text-brand-300",
  CLOSED: "bg-ink-800 text-slate-500",
};

// Admin queue for marketplace support tickets — same access pattern as
// /admin/messages (ADMIN_TOKEN query key or a real admin session), but tickets
// also need status/notes tracked, so each row has an inline editor (saves via
// PATCH /api/admin/support, which requires a real admin session).
export default async function AdminSupportPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  const authed = keyOk || !!user?.isAdmin;
  if (!authed) notFound();

  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  const fmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" });
  const open = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Support tickets</h1>
        <p className="text-sm text-slate-400">
          {tickets.length} total · {open} open · newest first within each status
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-10 text-center text-slate-400">No tickets yet.</div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="font-semibold text-white">
                  RC-{t.number} · {t.subject}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`chip text-[10px] font-bold ${STATUS_STYLE[t.status] ?? "bg-ink-800 text-slate-400"}`}>{t.status}</span>
                  <span className="text-xs text-slate-500">{fmt.format(t.createdAt)}</span>
                </div>
              </div>
              <div className="mt-0.5 text-sm text-slate-400">
                {t.name} ·{" "}
                <a href={`mailto:${t.email}`} className="text-accent hover:underline">{t.email}</a>
                {" · "}
                <span className="text-slate-500">{t.category}</span>
                {t.orderId && <span className="text-slate-500"> · order {t.orderId}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{t.message}</p>
              <div className="mt-3">
                <a
                  href={`mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent("Re: [RC-" + t.number + "] " + t.subject)}`}
                  className="text-xs font-medium text-brand-400 hover:underline"
                >
                  Reply →
                </a>
              </div>
              <AdminSupportRow id={t.id} initialStatus={t.status} initialNote={t.adminNote ?? ""} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
