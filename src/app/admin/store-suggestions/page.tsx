import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SuggestionActions } from "@/components/admin/SuggestionActions";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Store suggestions",
  robots: { index: false, follow: false },
};

type Suggestion = {
  id: string;
  storeName: string;
  storeUrl: string;
  country: string;
  email: string | null;
  note: string | null;
  status: string;
  createdAt: Date;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-gold/15 text-gold",
  added: "bg-brand-500/15 text-brand-300",
  rejected: "bg-ink-800 text-slate-500",
};

export default async function StoreSuggestionsAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const adminKey = keyOk ? token! : "";

  let rows: Suggestion[] = [];
  let error = false;
  try {
    rows = await prisma.storeSuggestion.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  } catch {
    error = true;
  }

  const pending = rows.filter((r) => r.status === "pending").length;
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-white">Store suggestions</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Stores submitted via the public{" "}
        <a href="/stores/suggest" className="text-brand-400 hover:underline">Suggest a store</a> form.
        Review each one, add real Shopify Riftbound sellers to <code className="text-slate-300">src/lib/retailers.ts</code>,
        then mark it <strong className="text-brand-300">added</strong>.
        {pending > 0 && <> <strong className="text-gold">{pending}</strong> awaiting review.</>}
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          Couldn&apos;t load suggestions right now.
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
          No store suggestions yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            let host = r.storeUrl;
            try {
              host = new URL(r.storeUrl).hostname.replace(/^www\./, "");
            } catch {
              /* keep raw */
            }
            return (
              <div
                key={r.id}
                className={`rounded-xl border border-ink-700 bg-ink-850 p-4 ${r.status === "rejected" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{r.storeName}</span>
                      <span className="chip bg-ink-800 text-slate-400">{r.country}</span>
                      <span className={`chip ${STATUS_STYLE[r.status] ?? "bg-ink-800 text-slate-500"}`}>{r.status}</span>
                    </div>
                    <a
                      href={r.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-1 block truncate text-sm text-brand-400 hover:underline"
                    >
                      {host} ↗
                    </a>
                    {r.note && <p className="mt-1.5 text-sm text-slate-400">“{r.note}”</p>}
                    <p className="mt-1.5 text-xs text-slate-500">
                      {fmtDate(r.createdAt)}
                      {r.email && (
                        <>
                          {" · "}
                          <a href={`mailto:${r.email}`} className="hover:text-slate-300">{r.email}</a>
                        </>
                      )}
                    </p>
                  </div>
                  <SuggestionActions id={r.id} status={r.status} adminKey={adminKey} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
