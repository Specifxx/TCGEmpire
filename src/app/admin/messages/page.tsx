import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SuggestionActions } from "@/components/admin/SuggestionActions";
import { FeedbackActions } from "@/components/admin/FeedbackActions";
import { PriceReportActions } from "@/components/admin/PriceReportActions";
import { formatMoney } from "@/lib/format";
import { issueLabel } from "@/lib/price-report";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Inbox",
  robots: { index: false, follow: false },
};

// Combines what used to be three separate dashboard tiles (Inbox, Store
// suggestions, Feedback) into one page — all three are "things a human sent in
// through a site form that another human needs to read and act on", and split
// three ways they were mostly empty rooms. /admin/store-suggestions and
// /admin/feedback (the routes) are gone; the API routes they post to
// (/api/admin/store-suggestions, /api/admin/feedback) are untouched, so the
// action buttons below work exactly as they did on the old pages.
export default async function AdminInboxPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const adminKey = keyOk ? token! : "";
  const keySuffix = keyOk && !user?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });
  const shortDateFmt = (d: Date) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  // ── Messages ─────────────────────────────────────────────────────────────
  const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 500 });

  // ── Store suggestions ────────────────────────────────────────────────────
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
  const SUGGESTION_STATUS_STYLE: Record<string, string> = {
    pending: "bg-gold/15 text-gold",
    added: "bg-brand-500/15 text-brand-300",
    rejected: "bg-ink-800 text-slate-500",
  };
  let suggestions: Suggestion[] = [];
  let suggestionsError = false;
  try {
    suggestions = await prisma.storeSuggestion.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  } catch {
    suggestionsError = true;
  }
  const pendingSuggestions = suggestions.filter((r) => r.status === "pending").length;

  // ── Feedback ─────────────────────────────────────────────────────────────
  type FeedbackRow = {
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
  const FEEDBACK_STATUS_STYLE: Record<string, string> = {
    NEW: "bg-brand-500/15 text-brand-300",
    APPROVED: "bg-gold/15 text-gold",
    HIDDEN: "bg-ink-800 text-slate-400",
    SPAM: "bg-red-500/10 text-red-400",
  };
  let feedback: FeedbackRow[] = [];
  let feedbackUsers = new Map<string, { displayName: string; email: string }>();
  let feedbackTotal = 0;
  let feedbackError = false;
  try {
    [feedback, feedbackTotal] = await Promise.all([
      prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.feedback.count(),
    ]);
    // userId is nullable (signed-out visitors can submit), so the lookup filters
    // the nulls out rather than querying for them.
    const ids = [...new Set(feedback.map((r) => r.userId).filter((v): v is string => !!v))];
    if (ids.length) {
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, email: true } });
      feedbackUsers = new Map(users.map((u) => [u.id, { displayName: u.displayName, email: u.email }]));
    }
  } catch {
    feedbackError = true;
  }
  const pendingFeedback = feedback.filter((r) => r.status === "NEW").length;
  const publishedFeedback = feedback.filter((r) => r.status === "APPROVED").length;

  // ── Wrong-price reports ──────────────────────────────────────────────────
  // Wrapped like the two queries above: this table is new, and a deploy that
  // reaches production a moment before `prisma db push` finishes must not take
  // the whole inbox down with it.
  type ReportRow = {
    id: string;
    kind: string;
    cardId: string | null;
    sealedGroupKey: string | null;
    retailer: string;
    retailerName: string;
    country: string;
    shownPriceCents: number | null;
    currency: string;
    issue: string;
    actualPriceCents: number | null;
    note: string | null;
    userId: string | null;
    email: string | null;
    page: string | null;
    status: string;
    createdAt: Date;
  };
  let reports: ReportRow[] = [];
  let reportsError = false;
  try {
    reports = await prisma.priceReport.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  } catch {
    reportsError = true;
  }
  const openReports = reports.filter((r) => r.status === "NEW");

  // THE ROLLUP IS THE POINT. One report is an anecdote a busy person skips; three
  // open reports against the same store in a fortnight is a scraper that has
  // broken, which is the failure StoreHealthSnapshot cannot see and this queue
  // exists to catch. Counting only OPEN reports on purpose — a store whose
  // reports were all checked and rejected is a store working correctly, and
  // including those would make the healthiest stores look like the worst.
  const FORTNIGHT_MS = 14 * 86_400_000;
  const recentOpen = openReports.filter((r) => Date.now() - new Date(r.createdAt).getTime() < FORTNIGHT_MS);
  const byRetailer = [...recentOpen.reduce((m, r) => m.set(r.retailerName, (m.get(r.retailerName) ?? 0) + 1), new Map<string, number>())]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);

  const REPORT_STATUS_STYLE: Record<string, string> = {
    NEW: "bg-brand-500/15 text-brand-300",
    CONFIRMED: "bg-red-500/10 text-red-400",
    REJECTED: "bg-ink-800 text-slate-400",
    FIXED: "bg-emerald-500/15 text-emerald-400",
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keySuffix}`} className="hover:text-slate-300">Admin</Link>
        <span>/</span>
        <span className="text-slate-300">Inbox</span>
      </nav>
      <h1 className="text-2xl font-bold text-white">Inbox</h1>
      <p className="mt-1 text-sm text-slate-400">
        Everything sent in through a site form: contact messages, store suggestions, feedback and wrong-price reports.
      </p>

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Contact messages</h2>
          <p className="text-xs text-slate-500">{messages.length} message{messages.length === 1 ? "" : "s"} · newest first</p>
        </div>
        {messages.length === 0 ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 px-4 py-8 text-center text-sm text-slate-400">
            No messages yet.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="font-semibold text-white">{m.subject || "RiftCompare feedback"}</div>
                  <div className="text-xs text-slate-500">{dateFmt.format(m.createdAt)}</div>
                </div>
                <div className="mt-0.5 text-sm text-slate-400">
                  {m.name} ·{" "}
                  <a href={`mailto:${m.email}`} className="text-accent hover:underline">{m.email}</a>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{m.message}</p>
                <div className="mt-3">
                  <a
                    href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("Re: " + (m.subject || "RiftCompare feedback"))}`}
                    className="text-xs font-medium text-brand-400 hover:underline"
                  >
                    Reply →
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Store suggestions ─────────────────────────────────────────────── */}
      <section className="mt-10 border-t border-ink-800 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Store suggestions</h2>
          {pendingSuggestions > 0 && <p className="text-xs text-slate-500"><strong className="text-gold">{pendingSuggestions}</strong> awaiting review</p>}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Submitted via the public <a href="/stores/suggest" className="text-brand-400 hover:underline">Suggest a store</a> form.
          Review each one, add real Shopify Riftbound sellers to <code className="text-slate-300">src/lib/retailers.ts</code>,
          then mark it <strong className="text-brand-300">added</strong>.
        </p>
        {suggestionsError ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            Couldn&apos;t load suggestions right now.
          </div>
        ) : suggestions.length === 0 ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            No store suggestions yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {suggestions.map((r) => {
              let host = r.storeUrl;
              try {
                host = new URL(r.storeUrl).hostname.replace(/^www\./, "");
              } catch {
                /* keep raw */
              }
              return (
                <div key={r.id} className={`rounded-xl border border-ink-700 bg-ink-850 p-4 ${r.status === "rejected" ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{r.storeName}</span>
                        <span className="chip bg-ink-800 text-slate-400">{r.country}</span>
                        <span className={`chip ${SUGGESTION_STATUS_STYLE[r.status] ?? "bg-ink-800 text-slate-500"}`}>{r.status}</span>
                      </div>
                      <a href={r.storeUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block truncate text-sm text-brand-400 hover:underline">
                        {host} ↗
                      </a>
                      {r.note && <p className="mt-1.5 text-sm text-slate-400">“{r.note}”</p>}
                      <p className="mt-1.5 text-xs text-slate-500">
                        {shortDateFmt(r.createdAt)}
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
      </section>

      {/* ── Feedback ──────────────────────────────────────────────────────── */}
      <section className="mt-10 border-t border-ink-800 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Feedback &amp; reviews</h2>
          {feedbackTotal > 0 && (
            <p className="text-xs text-slate-500">{feedbackTotal.toLocaleString()} total · {pendingFeedback} new · {publishedFeedback} published</p>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          From the <Link href="/feedback" className="text-brand-400 hover:underline">feedback page</Link> and the site-wide widget — signed-in and anonymous.
        </p>
        <p className="mt-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-slate-500">
          Only submissions where the person ticked <strong className="text-slate-300">&ldquo;you can show this
          publicly&rdquo;</strong> can be published — the API refuses the rest. Everything here is readable either way.
        </p>
        {feedbackError ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            Couldn&apos;t load feedback right now.
          </div>
        ) : feedback.length === 0 ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            No feedback yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {feedback.map((r) => {
              const u = r.userId ? feedbackUsers.get(r.userId) : undefined;
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
                    <span className={`chip ${FEEDBACK_STATUS_STYLE[r.status] ?? "bg-ink-800 text-slate-400"}`}>{r.status}</span>
                    {r.consentPublic && <span className="chip bg-brand-500/10 text-brand-300">consented</span>}
                    <span className="ml-auto text-xs text-slate-500">{shortDateFmt(r.createdAt)}</span>
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
      </section>

      {/* ── Wrong-price reports ───────────────────────────────────────────── */}
      <section className="mt-10 border-t border-ink-800 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-white">Wrong-price reports</h2>
          {reports.length > 0 && (
            <p className="text-xs text-slate-500">
              {reports.length.toLocaleString()} recent · {openReports.length} open
            </p>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-400">
          From the “Spotted a wrong price?” link on card pages, the card quick-view and the sealed quick-view. The
          &ldquo;we show&rdquo; figure was read from our own database when the report landed; the &ldquo;they say&rdquo;
          figure is the reporter&apos;s claim and is unverified.
        </p>

        {/* A store with several open reports is the signal; a single report is
            noise. This banner is the only part of the section worth reading at a
            glance. */}
        {byRetailer.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-slate-300">
            <strong className="text-red-400">Check these stores&apos; scrapers:</strong>{" "}
            {byRetailer.map(([name, n], i) => (
              <span key={name}>
                {i > 0 && " · "}
                {name} <span className="text-slate-500">({n} open in 14d)</span>
              </span>
            ))}
          </div>
        )}

        {reportsError ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            Couldn&apos;t load price reports right now.
          </div>
        ) : reports.length === 0 ? (
          <div className="mt-3 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">
            No price reports yet.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{r.retailerName}</span>
                  <span className="chip bg-ink-800 text-slate-400">{r.country}</span>
                  <span className="chip bg-ink-800 text-slate-400">{r.kind}</span>
                  <span className="chip bg-brand-500/10 text-brand-300">{issueLabel(r.issue)}</span>
                  <span className={`chip ${REPORT_STATUS_STYLE[r.status] ?? "bg-ink-800 text-slate-400"}`}>{r.status}</span>
                  <span className="ml-auto text-xs text-slate-500">{shortDateFmt(r.createdAt)}</span>
                </div>

                <div className="num mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-400">
                    we show{" "}
                    <strong className="text-white">
                      {r.shownPriceCents == null ? "— (listing gone)" : formatMoney(r.shownPriceCents, r.currency)}
                    </strong>
                  </span>
                  {r.actualPriceCents != null && (
                    <span className="text-slate-400">
                      they say <strong className="text-red-400">{formatMoney(r.actualPriceCents, r.currency)}</strong>
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-600">
                  <span>{r.userId ? "signed-in" : "anonymous"}</span>
                  {r.email && <span>{r.email}</span>}
                  {r.page && <span>on {r.page}</span>}
                  {r.cardId && (
                    <Link href={`/card/${r.cardId}`} className="text-brand-400 hover:underline">
                      open card ↗
                    </Link>
                  )}
                  {r.sealedGroupKey && <span>group {r.sealedGroupKey}</span>}
                </div>

                {r.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.note}</p>}
                <PriceReportActions id={r.id} status={r.status} adminKey={adminKey} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
