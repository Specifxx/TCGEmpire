import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLatestReport, SNAPSHOT_STALE_HOURS } from "@/lib/ops/snapshot";
import { getInboxCounts } from "@/lib/ops/inbox-counts";
import { countBy, worst } from "@/lib/ops/types";
import { humanAge } from "@/lib/ops/thresholds";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

type Tool = { href: string; title: string; icon: string; desc: string };

// STORE REPORT LINKS (/admin/store-partners) AND OUTBOUND CLICKS (/admin/clicks)
// ARE DELIBERATELY ABSENT (2026-09-22, owner: "get rid of the store report links
// and outbound clicks from the dashboard"). Both ROUTES still exist and still
// work — this removes them from the index, it does not delete the tools, so any
// link already sent or bookmarked keeps working and nothing that reads
// ClickEvent or StorePartner changed. Re-add a tile here if either comes back
// into regular use.
const TOOLS: Tool[] = [
  {
    href: "/admin/health",
    title: "Health & limits",
    icon: "🩺",
    desc: "Database transfer limits, eBay, store prices, scheduled jobs, Stripe, email and the live site, checked every three hours. You are emailed when something needs a look.",
  },
  {
    href: "/admin/accounts",
    title: "Accounts",
    icon: "👤",
    desc: "Every registered user — when they signed up, sign-in method, premium & verification status.",
  },
  {
    href: "/admin/premium",
    title: "Premium interest",
    icon: "💎",
    desc: "Who clicked a Premium CTA or started checkout — interest ahead of conversion.",
  },
  {
    href: "/admin/premium-offer",
    title: "Trial promo email",
    icon: "🎁",
    desc: "Subscribe now, 14 days free: email every account that can still start a trial — see the reach, send yourself a test, then send in daily batches.",
  },
  {
    href: "/admin/premium-winback",
    title: "Premium win-back email",
    icon: "🔗",
    desc: "Send recently-registered free accounts a single-use link that grants a few days of Premium instantly — no card, no checkout, no manual grant step.",
  },
  {
    href: "/admin/subscriptions",
    title: "Subscription metrics",
    icon: "📊",
    desc: "MRR, churn, LTV, plan mix and cohort retention — the revenue read, straight from Stripe.",
  },
  {
    href: "/admin/consulting",
    title: "Consulting bookings",
    icon: "💼",
    desc: "Paid store consulting sessions — who booked, what they want out of the hour, and who filled in the form but never finished checkout.",
  },
  {
    href: "/admin/messages",
    title: "Inbox",
    icon: "✉️",
    desc: "Contact messages, store suggestions, feedback and wrong-price reports — everything sent in through a site form.",
  },
  {
    href: "/admin/decks",
    title: "Decks",
    icon: "🃏",
    desc: "Import tournament decklists as JSON, and hide or restore any published deck.",
  },
  {
    href: "/admin/rising",
    title: "Rising cards",
    icon: "🚀",
    desc: "Cards gaining momentum — the rising-price signal.",
  },
  {
    href: "/admin/demand",
    title: "Demand",
    icon: "🔥",
    desc: "Demand snapshots — what people are searching and wishlisting.",
  },
  {
    href: "/admin/loyalty",
    title: "Loyal users",
    icon: "🏆",
    desc: "Most active by days used, biggest collections, longest-tenured Premium members.",
  },
  {
    href: "/admin/store-health",
    title: "Store data health",
    icon: "🩺",
    desc: "Per-store checks — stale fetch, dropped listings, frozen or jumped prices — for a scraper breaking silently.",
  },
];

export default async function AdminHome({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  // When authed via the ?key= link (not a logged-in admin), carry the key onto each
  // tool link so you don't have to re-append it every time.
  const suffix = keyOk && !user?.isAdmin ? `?key=${encodeURIComponent(token!)}` : "";

  // One cheap row (the monitor's last report) and five count queries. Both degrade to "nothing to show".
  const [report, inbox] = await Promise.all([getLatestReport(), getInboxCounts().catch(() => null)]);
  const ageH = report ? (Date.now() - Date.parse(report.generatedAt)) / 3_600_000 : null;
  const counts = report ? countBy(report.results) : null;
  const overall = report ? worst(report.results) : "unknown";
  const stale = ageH != null && ageH > SNAPSHOT_STALE_HOURS;
  const strip = !report
    ? { tone: "border-slate-600 text-slate-300", dot: "bg-slate-500", text: "No health report yet" }
    : stale
      ? { tone: "border-rose-500/50 text-rose-200", dot: "bg-rose-500", text: `The monitor has not reported for ${humanAge(ageH!)}` }
      : overall === "crit"
        ? { tone: "border-rose-500/50 text-rose-200", dot: "bg-rose-500", text: `${counts!.crit} need${counts!.crit === 1 ? "s" : ""} action` }
        : overall === "warn"
          ? { tone: "border-gold/50 text-gold", dot: "bg-gold", text: `${counts!.warn} to keep an eye on` }
          : { tone: "border-brand-500/40 text-brand-300", dot: "bg-brand-400", text: "Everything is healthy" };
  const badges: Record<string, number> = { "/admin/messages": inbox?.total ?? 0 };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <span className="chip bg-brand-500/15 text-brand-300">{user?.isAdmin ? "signed in" : "token access"}</span>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Internal tools. This area is admin-only and excluded from search engines.
        {user?.email && <> Signed in as <span className="text-slate-300">{user.email}</span>.</>}
      </p>

      <Link href={`/admin/health${suffix}`} className={`mt-5 flex items-center gap-3 rounded-xl border bg-ink-850 px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 ${strip.tone}`}>
        <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${strip.dot}`} />
        {strip.text}
        {inbox && inbox.total > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white">{inbox.total} new in the inbox</span>}
        <span className={inbox && inbox.total > 0 ? "text-slate-600" : "ml-auto text-slate-600"}>→</span>
      </Link>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={`${t.href}${suffix}`}
            className="card-surface flex flex-col gap-1 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-500/60 hover:shadow-glow"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>{t.icon}</span>
              <span className="font-bold text-white">{t.title}</span>
              {badges[t.href] > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{badges[t.href]} new</span>}
              <span className="ml-auto text-slate-600">→</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">{t.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 border-t border-ink-800 pt-4 text-xs text-slate-500">
        <p className="font-semibold uppercase tracking-wide text-slate-400">Quick links</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/stores/suggest" className="text-brand-400 hover:underline">Public suggest-a-store form ↗</Link>
          <Link href="/stores/tracked" className="text-brand-400 hover:underline">Tracked stores ↗</Link>
          <Link href="/" className="text-brand-400 hover:underline">Back to site ↗</Link>
        </div>
      </div>
    </div>
  );
}
