import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FeedbackActions } from "@/components/admin/FeedbackActions";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Feedback",
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  userId: string | null;
  message: string;
  rating: number | null;
  createdAt: Date;
  email: string | null;
  displayName: string | null;
  page: string | null;
  source: string;
  status: string;
  consentPublic: boolean;
  publishedAt: Date | null;
};

const STATUS_STYLE: Record<string, string> = {
  NEW: "bg-brand-500/15 text-brand-300",
  APPROVED: "bg-gold/15 text-gold",
  HIDDEN: "bg-ink-800 text-slate-400",
  SPAM: "bg-red-500/10 text-red-400",
};

export default async function FeedbackAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();

  const adminKey = keyOk ? token! : "";
  const keySuffix = keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  let rows: Row[] = [];
  let umap = new Map<string, { displayName: string; email: string }>();
  let total = 0;
  let error = false;
  try {
    [rows, total] = await Promise.all([
      prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.feedback.count(),
    ]);
    // userId is nullable now (signed-out visitors can submit), so the account
    // lookup filters the nulls out rather than querying for them.
    const ids = [...new Set(rows.map((r) => r.userId).filter((v): v is string => !!v))];
    if (ids.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, email: true },
      });
      umap = new Map(users.map((u) => [u.id, { displayName: u.displayName, email: u.email }]));
    }
  } catch {
    error = true;
  }

  const fmt = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const pending = rows.filter((r) => r.status === "NEW").length;
  const published = rows.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Feedback</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Feedback &amp; reviews</h1>
      <p className="mt-1 text-sm text-slate-400">
        From the <Link href="/feedback" className="text-brand-400 hover:underline">feedback page</Link> and the
        site-wide widget — signed-in and anonymous.
        {total > 0 && <> {total.toLocaleString()} total · {pending} new · {published} published.</>}
      </p>
      <p className="mt-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-slate-500">
        Only submissions where the person ticked <strong className="text-slate-300">&ldquo;you can show this
        publicly&rdquo;</strong> can be published — the API refuses the rest. Everything here is readable either way.
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load feedback right now.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          No feedback yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            const u = r.userId ? umap.get(r.userId) : undefined;
            const who = u?.displayName ?? (r.userId ? "Unknown user" : "Anonymous visitor");
            const contact = u?.email ?? r.email ?? null;
            return (
              <div key={r.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{who}</span>
                  {contact && <span className="text-xs text-slate-500">{contact}</span>}
                  {r.rating != null && (
                    <span className="chip bg-gold/15 text-gold" aria-label={`${r.rating} out of 5`}>
                      {"★".repeat(r.rating)}<span className="text-gold/30">{"★".repeat(5 - r.rating)}</span>
                    </span>
                  )}
                  <span className={`chip ${STATUS_STYLE[r.status] ?? "bg-ink-800 text-slate-400"}`}>{r.status}</span>
                  {r.consentPublic && <span className="chip bg-brand-500/10 text-brand-300">consented</span>}
                  <span className="ml-auto text-xs text-slate-500">{fmt(r.createdAt)}</span>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-600">
                  <span>via {r.source}</span>
                  {r.page && <span>on {r.page}</span>}
                  {r.consentPublic && r.displayName && <span>shows as &ldquo;{r.displayName}&rdquo;</span>}
                </div>

                {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.message}</p>}

                <FeedbackActions id={r.id} status={r.status} consentPublic={r.consentPublic} adminKey={adminKey} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
