import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getRisingCards, type RisePick, type RiseComponents, type RiseScope } from "@/lib/rise-predictor";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { formatMoney } from "@/lib/format";
import { currencyOf, COUNTRY_LIST } from "@/lib/country";
import { getCountry } from "@/lib/get-country";
import { cardHref } from "@/lib/card-url";
import { PremiumButton } from "@/components/PremiumButton";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Rising Cards — Riftbound Cards Likely to Go Up | RiftCompare" },
  description:
    "A Premium screener ranking Riftbound cards by demand and price-timing signals — high or rising search interest that hasn't re-rated yet. Transparent scoring, backtested, not financial advice.",
  keywords: ["riftbound rising cards", "riftbound price predictions", "riftbound card demand", "riftbound investing", "riftbound cards going up"],
  alternates: { canonical: "/tools/rising" },
  openGraph: { title: "Rising Cards — Riftbound cards likely to go up", url: `${SITE_URL}/tools/rising` },
};

const RISING_FAQS = [
  {
    q: "What is Rising Cards?",
    a: "A screener that ranks Riftbound cards by a composite of demand and price-timing signals — cards with high or rising search interest that haven't re-rated yet (sitting near their own recent low, thin supply, not already spiking). Every input is real, quoted data; the score is a transparent weighted sum, not a black box.",
  },
  {
    q: "What signals does the score use?",
    a: "Demand (search volume), demand velocity (rising searches/day — the leading indicator), room to run (how close a card sits to its own recent low), scarcity (thin in-stock supply), momentum (an emerging, not-yet-overheated 7-day trend) and volatility. Cards that already spiked hard in the last 7 days are penalised, not rewarded.",
  },
  {
    q: "Is this financial advice?",
    a: "No. It's a heuristic screen of public price and demand data, validated with a lookahead-free backtest on the price-timing component (demand isn't historically reconstructable, so only part of the score is backtestable). Treat it as a research starting point, not a guarantee — always check a card's own price history before buying.",
  },
  {
    q: "How often does it update?",
    a: "Once a day, alongside the daily price and demand import. Demand velocity needs a few days of snapshots to activate for any given card — until then that component sits at zero and the score leans on demand level instead.",
  },
];

// Compact server-rendered sparkline (no client JS) from a cents series.
function Spark({ values, w = 88, h = 26 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <span className="text-slate-600">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "#34d17e" : "#fb7185"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Pct({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-600">—</span>;
  const tone = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-slate-400";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return <span className={`num ${tone}`}>{sign}{Math.abs(v).toFixed(1)}%</span>;
}

// One z-score component as a diverging bar (centred at 0; right = positive).
function ZBar({ z, label }: { z: number; label: string }) {
  const mag = Math.min(1, Math.abs(z) / 2.5); // ±2.5σ fills the half-bar
  const pos = z >= 0;
  return (
    <span className="flex items-center gap-1" title={`${label}: z=${z.toFixed(2)}`}>
      <span className="relative h-1.5 w-8 rounded-full bg-ink-800">
        <span
          className={`absolute top-0 h-1.5 ${pos ? "rounded-r-full bg-brand-500/80" : "rounded-l-full bg-rose-500/70"}`}
          style={pos ? { left: "50%", width: `${mag * 50}%` } : { right: "50%", width: `${mag * 50}%` }}
        />
      </span>
    </span>
  );
}

const COMPONENTS: { key: keyof RiseComponents; label: string }[] = [
  { key: "demand", label: "Demand" },
  { key: "velocity", label: "Velocity" },
  { key: "room", label: "Room" },
  { key: "scarcity", label: "Scarcity" },
  { key: "momentum", label: "Momentum" },
];

function ConfidenceChip({ c }: { c: RisePick["confidence"] }) {
  return (
    <span className={`chip ${c === "High" ? "bg-brand-500/15 text-brand-300" : c === "Medium" ? "bg-gold/15 text-gold" : "bg-ink-800 text-slate-400"}`}>
      {c}
    </span>
  );
}

function CardCell({ p }: { p: RisePick }) {
  return (
    <Link href={cardHref({ id: p.id, slug: p.slug })} className="flex items-center gap-2.5">
      {p.imageThumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageThumbUrl} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{p.displayName}</span>
        <span className="block text-[11px] text-slate-500">{p.setCode} · {p.collectorNumber}{p.overheated ? " · ⚠ hot" : ""}</span>
      </span>
    </Link>
  );
}

function RisingRow({ p, rank, currency }: { p: RisePick; rank: number; currency: string }) {
  return (
    <tr className="hover:bg-ink-800">
      <td className="px-3 py-2 text-slate-500">{rank}</td>
      <td className="px-3 py-2">
        <CardCell p={p} />
      </td>
      <td className="px-2 py-2 text-right">
        <span className="num text-base font-extrabold text-brand-300">{p.score}</span>
      </td>
      <td className="hidden px-2 py-2 sm:table-cell">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {COMPONENTS.map((c) => <ZBar key={c.key} z={p.components[c.key]} label={c.label} />)}
        </div>
      </td>
      <td className="num px-2 py-2 text-right text-slate-200">{p.priceCents != null ? formatMoney(p.priceCents, currency) : "—"}</td>
      <td className="px-2 py-2 text-right"><Pct v={p.trend7} /></td>
      <td className="hidden px-2 py-2 sm:table-cell"><Spark values={p.spark} /></td>
      <td className="px-3 py-2 text-right"><ConfidenceChip c={p.confidence} /></td>
    </tr>
  );
}

function TableHead() {
  return (
    <thead>
      <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
        <th className="px-3 py-2.5 font-semibold">#</th>
        <th className="px-3 py-2.5 font-semibold">Card</th>
        <th className="px-2 py-2.5 text-right font-semibold">Score</th>
        <th className="hidden px-2 py-2.5 font-semibold sm:table-cell">Signals</th>
        <th className="px-2 py-2.5 text-right font-semibold">Price</th>
        <th className="px-2 py-2.5 text-right font-semibold">7d</th>
        <th className="hidden px-2 py-2.5 font-semibold sm:table-cell">30d</th>
        <th className="px-3 py-2.5 text-right font-semibold">Conf.</th>
      </tr>
    </thead>
  );
}

export default async function RisingPage({ searchParams }: { searchParams: { scope?: string } }) {
  const user = await getCurrentUser();
  const premium = isPremium(user);
  const country = getCountry();

  const raw = (searchParams.scope ?? "").toUpperCase();
  const scope: RiseScope = raw === "AU" || raw === "NZ" || raw === "US" || raw === "UK" ? (raw as RiseScope) : "GLOBAL";
  const isGlobal = scope === "GLOBAL";
  const currency = isGlobal ? "AUD" : currencyOf(scope);

  // Cached per scope (heavy 400-card scan) — shared between the free teaser and the
  // full Premium view, refreshed on the daily import via CONTENT_TAG. A free visitor
  // triggers the same cached computation an admin/premium visitor would; only the
  // SLICE shown differs, so there's no extra query cost for gating.
  const analysis = await unstable_cache(() => getRisingCards(scope), ["rising-cards-public", scope], {
    revalidate: 3600,
    tags: [CONTENT_TAG],
  })();
  const top = analysis.picks[0];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">Tools</Link>
          <span>/</span>
          <span className="text-slate-300">Rising Cards</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Rising Cards</h1>
          {premium && (
            <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
              {[{ code: "GLOBAL" as RiseScope, flag: "🌐", label: "Global" }, ...COUNTRY_LIST.map((c) => ({ code: c.code as RiseScope, flag: c.flag, label: c.code }))].map((opt) => {
                const active = opt.code === scope;
                return (
                  <Link
                    key={opt.code}
                    href={opt.code === "GLOBAL" ? "/tools/rising" : `/tools/rising?scope=${opt.code}`}
                    className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    {opt.flag} {opt.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Cards ranked by a composite of <strong className="text-slate-200">demand and price-timing signals</strong> — high or
          rising search interest that hasn&apos;t re-rated yet. Real data, transparent scoring, backtested. Not financial advice.
        </p>
      </div>

      {!premium ? (
        <div className="card-surface overflow-hidden">
          <table className="w-full min-w-[560px] text-sm">
            <TableHead />
            <tbody className="divide-y divide-ink-800">
              {top ? (
                <RisingRow p={top} rank={1} currency={currency} />
              ) : (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">Not enough data yet — check back once a few days of price history have built up.</td></tr>
              )}
            </tbody>
          </table>
          <div className="relative border-t border-ink-800">
            <ul className="divide-y divide-ink-800 blur-[5px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-2.5 px-4 py-3 opacity-60">
                  <div className="h-10 w-7 shrink-0 rounded-sm bg-ink-800" />
                  <div className="flex-1 space-y-1.5"><div className="h-2.5 w-2/5 rounded bg-ink-800" /><div className="h-2 w-1/4 rounded bg-ink-800" /></div>
                  <div className="h-3 w-10 rounded bg-ink-800" />
                </li>
              ))}
            </ul>
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-transparent to-ink-900/60 p-4 text-center">
              <div>
                <p className="text-sm font-bold text-white">Unlock the full Rising Cards list</p>
                <p className="mx-auto mt-0.5 max-w-sm text-xs text-slate-400">
                  See all {Math.min(40, analysis.picks.length)} ranked picks, every market (or Global), with the full signal
                  breakdown — not just the top pick.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {user ? <PremiumButton /> : <Link href="/register?next=/tools/rising" className="btn-primary text-sm">Create a free account</Link>}
                  <Link href="/movers" className="btn-ghost text-sm">Free price movers →</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : analysis.picks.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          Not enough price/demand history yet{isGlobal ? "" : ` in ${scope}`} — signals appear once a few days of daily
          snapshots have built up.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <TableHead />
            <tbody className="divide-y divide-ink-800">
              {analysis.picks.map((p, i) => <RisingRow key={p.id} p={p} rank={i + 1} currency={currency} />)}
            </tbody>
          </table>
          <p className="p-3 text-[11px] text-slate-600">
            Score is a 0–100 percentile of a weighted composite (demand, velocity, room to run, scarcity, momentum,
            volatility) across the {analysis.qualifying} most-searched priced cards. Hover a signal bar for its exact
            z-score. A research signal, not advice — always sanity-check the card&apos;s own price history.
          </p>
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How Rising Cards works</h2>
        <div className="card-surface divide-y divide-ink-800">
          {RISING_FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: RISING_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Rising Cards", item: `${SITE_URL}/tools/rising` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Rising Cards",
              url: `${SITE_URL}/tools/rising`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: currency },
              description: "Ranks Riftbound cards by demand and price-timing signals to surface ones likely to rise soon.",
            },
          ]),
        }}
      />
    </div>
  );
}
