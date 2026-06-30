import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getLatestMarketReport, getMarketReportList } from "@/lib/posts";
import { DailyWrapHero } from "@/components/DailyWrapHero";
import { SITE_URL } from "@/lib/site";

// The market wrap archive — every daily report in one explorable place. Revalidate
// often enough that a freshly-generated wrap appears promptly.
export const revalidate = 600;

export const metadata: Metadata = {
  title: { absolute: "Daily Riftbound Market Wrap — Archive | RiftCompare" },
  description:
    "Every daily Riftbound market wrap in one place — the automated report on what moved the RiftCompare Index each day, region by region, with charts and the biggest movers.",
  keywords: [
    "Riftbound market wrap",
    "Riftbound market report",
    "daily Riftbound prices",
    "RiftCompare Index report",
    "Riftbound market news",
  ],
  alternates: { canonical: "/market/wrap" },
  openGraph: {
    title: "Daily Riftbound Market Wrap — Archive",
    description:
      "What moved the Riftbound market, every day. The full archive of RiftCompare Index daily wraps, each with charts.",
    url: `${SITE_URL}/market/wrap`,
  },
};

export default async function MarketWrapArchive() {
  const latest = await unstable_cache(getLatestMarketReport, ["market-wrap-latest"], { revalidate: 600 })();
  const all = await unstable_cache(() => getMarketReportList(120), ["market-wrap-list"], { revalidate: 600 })();
  // The featured wrap gets the hero slot; don't list it again below.
  const rest = latest ? all.filter((r) => r.slug !== latest.article.slug) : all;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "RiftCompare Index", item: `${SITE_URL}/market` },
      { "@type": "ListItem", position: 3, name: "Daily market wrap", item: `${SITE_URL}/market/wrap` },
    ],
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Hero */}
      <section className="card-surface overflow-hidden border-l-2 border-brand-500 bg-ink-900 px-6 py-7">
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/market" className="hover:text-slate-300">RiftCompare Index</Link>
          <span>/</span>
          <span className="text-slate-300">Daily market wrap</span>
        </nav>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Daily market wrap</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          The automated daily read on the Riftbound market — what moved the RiftCompare Index, region
          by region, and why. A fresh wrap is published every day after the price refresh, each with
          charts and the biggest movers.
        </p>
        <Link href="/market" className="btn-ghost mt-4 inline-flex text-sm">← Back to the Index</Link>
      </section>

      {latest && <DailyWrapHero post={latest} />}

      {rest.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-extrabold text-white">Earlier wraps</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((r) => (
              <Link
                key={r.slug}
                href={`/blog/${r.slug}`}
                className="card-surface p-4 transition-colors hover:border-ink-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">{r.day}</span>
                  {r.globalChangePct != null && (
                    <span className={`num text-xs font-bold ${r.globalChangePct > 0 ? "text-up" : r.globalChangePct < 0 ? "text-down" : "text-slate-400"}`}>
                      {r.globalChangePct > 0 ? "+" : r.globalChangePct < 0 ? "−" : ""}
                      {Math.abs(r.globalChangePct).toFixed(2)}%
                    </span>
                  )}
                </div>
                <h3 className="mt-1 line-clamp-2 text-sm font-bold text-white">{r.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{r.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        !latest && (
          <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
            <div>
              <p className="text-lg font-semibold text-white">No wraps yet</p>
              <p className="mt-1 text-sm">
                The first daily market wrap publishes after the next price refresh. Check back soon.
              </p>
              <Link href="/market" className="btn-primary mt-4">View the Index →</Link>
            </div>
          </div>
        )
      )}
    </div>
  );
}
