import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

type Tool = { href: string; title: string; icon: string; desc: string };

const TOOLS: Tool[] = [
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
    href: "/admin/subscriptions",
    title: "Subscription metrics",
    icon: "📊",
    desc: "MRR, churn, LTV, plan mix and cohort retention — the revenue read, straight from Stripe.",
  },
  {
    href: "/admin/clicks",
    title: "Outbound clicks",
    icon: "📈",
    desc: "Per-store affiliate click counts (7d / 30d / all-time), by market and type.",
  },
  {
    href: "/admin/messages",
    title: "Inbox",
    icon: "✉️",
    desc: "Contact messages, store suggestions and feedback — everything sent in through a site form.",
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
    desc: "Biggest collections and longest-tenured Premium members.",
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={`${t.href}${suffix}`}
            className="card-surface flex flex-col gap-1 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-500/60 hover:shadow-glow"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>{t.icon}</span>
              <span className="font-bold text-white">{t.title}</span>
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
