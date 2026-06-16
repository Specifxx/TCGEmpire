import type { Metadata } from "next";
import Link from "next/link";
import { CardQuickLink } from "@/components/CardQuickLink";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getUndervalued } from "@/lib/screener";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Value Finder — Undervalued Riftbound Cards | RiftCompare" },
  description:
    "A Premium screener for Riftbound cards trading below their recent average — a mean-reversion signal for value buyers and flippers, ranked by how far below their usual price they are.",
  alternates: { canonical: "/tools/value-finder" },
  openGraph: { title: "Value Finder — undervalued Riftbound cards", url: `${SITE_URL}/tools/value-finder` },
};

export default async function ValueFinderPage() {
  const user = await getCurrentUser();
  const premium = isPremium(user);
  const country = getCountry();
  const info = COUNTRIES[country];
  const picks = premium ? await getUndervalued(country) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Value Finder</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">🔎 Value Finder</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          {info.adjective} cards trading <strong className="text-slate-200">below their own recent average</strong> — a
          mean-reversion signal for value buyers and flippers. Ranked by how far below their usual price they sit, not just
          today&apos;s movement.
        </p>
      </div>

      {!premium ? (
        <div className="card-surface p-6 text-center">
          <p className="text-4xl" aria-hidden>🔎</p>
          <h2 className="mt-2 text-lg font-extrabold text-white">Value Finder is a Premium tool</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Premium members get the screener: the cards trading furthest below their 30-day average right now, with the
            discount and how far off their recent high each one is.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {user ? (
              <Link href="/premium" className="btn-primary text-sm">★ See Premium</Link>
            ) : (
              <Link href="/register?next=/tools/value-finder" className="btn-primary text-sm">Create a free account</Link>
            )}
            <Link href="/movers" className="btn-ghost text-sm">Free price movers →</Link>
          </div>
        </div>
      ) : picks.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          No clearly-undervalued cards right now — the market&apos;s near its averages. Check back as prices move.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-semibold">Card</th>
                <th className="px-2 py-2.5 text-right font-semibold">Now</th>
                <th className="px-2 py-2.5 text-right font-semibold">30-day avg</th>
                <th className="px-2 py-2.5 text-right font-semibold">vs avg</th>
                <th className="px-4 py-2.5 text-right font-semibold">off high</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {picks.map((p) => (
                <tr key={p.card.id} className="hover:bg-ink-900/50">
                  <td className="px-4 py-2">
                    <CardQuickLink card={p.card} className="flex items-center gap-2.5">
                      {p.card.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.card.imageThumbUrl} alt="" width={28} height={39} loading="lazy" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{p.card.name}</span>
                        <span className="block text-[11px] text-slate-500">{p.card.setCode} · {p.card.collectorNumber}</span>
                      </span>
                    </CardQuickLink>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-accent">{formatMoney(p.currentCents, info.currency)}</td>
                  <td className="px-2 py-2 text-right text-slate-400">{formatMoney(p.avgCents, info.currency)}</td>
                  <td className="px-2 py-2 text-right font-bold text-brand-400">▼ {p.discountPct}%</td>
                  <td className="px-4 py-2 text-right text-slate-300">{p.offHighPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-3 text-[11px] text-slate-600">
            &quot;vs avg&quot; is how far below the card&apos;s mean lowest price over the last 30 days it&apos;s trading now.
            A signal, not advice — thin markets and one-off listings can mislead; always sanity-check the card page.
          </p>
        </div>
      )}
    </div>
  );
}
