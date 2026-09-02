import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { ADSENSE_REVIEW_MODE } from "@/lib/adsense";
import { getRisingSealed, type SealedRisePick, type SealedRiseComponents } from "@/lib/sealed-rise-predictor";
import { CONTENT_TAG } from "@/lib/revalidate-content";
import { sydneyDayKey } from "@/lib/price-history";
import { formatMoney } from "@/lib/format";
import { COUNTRIES, DEFAULT_COUNTRY, currencyOf, type Country } from "@/lib/country";
import { MarketSwitcher } from "@/components/MarketSwitcher";
import { sealedImageAlt } from "@/lib/image-alt";
import { PremiumButton } from "@/components/PremiumButton";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// Same reasoning as /tools/rising and every other ?param=-driven page in this
// codebase (see /market's own file-header note for the full failure mode this
// avoids): force-dynamic so a market variant nobody has requested yet never
// serves a loading spinner as its complete response.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Rising Sealed — Riftbound Sealed Products Likely to Go Up | RiftCompare" },
  description:
    "A Premium screener ranking Riftbound sealed products by price-timing and supply signals — booster boxes and packs that haven't re-rated yet. Transparent scoring, backtested, not financial advice.",
  keywords: ["riftbound rising sealed", "riftbound sealed price predictions", "riftbound booster box investing", "riftbound sealed products going up"],
  alternates: pageAlternates("/tools/rising-sealed"),
  openGraph: { title: "Rising Sealed — Riftbound sealed products likely to go up", url: `${SITE_URL}/tools/rising-sealed` },
};

const RISING_FAQS = [
  {
    q: "What is Rising Sealed?",
    a: "A screener that ranks Riftbound sealed products — booster boxes, packs, bundles and Proving Grounds kits — by a composite of price-timing and supply signals: products sitting near their own recent low, with thin in-stock supply, that haven't already spiked. Every input is real, quoted data; the score is a transparent weighted sum, not a black box.",
  },
  {
    q: "What signals does the score use, and how is this different from Rising Cards?",
    a: "Room to run (how close a product sits to its own recent low), scarcity (thin in-stock supply across tracked stores), momentum (an emerging, not-yet-overheated 7-day trend) and volatility. Unlike Rising Cards, there is no demand or demand-velocity component — sealed products aren't search/view-tracked on RiftCompare today, and a made-up demand proxy would be worse than none at all. This is a narrower, price-and-supply-only signal.",
  },
  {
    q: "Is this financial advice?",
    a: "No. It's a heuristic screen of public price and inventory data, validated with a lookahead-free backtest on the room-to-run signal. Treat it as a research starting point, not a guarantee — always check a product's own price history before buying.",
  },
  {
    q: "How often does it update?",
    a: "The price-history side updates weekly, alongside the sealed price-history snapshot. The scarcity signal (live in-stock listing counts) can move sooner, since it's refreshed on every sealed price import.",
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

// All 4 components shown (unlike Rising Cards, which drops volatility from the
// bars to fit demand+velocity+room+scarcity+momentum) — there are only 4 to
// begin with (see SealedRiseComponents), so all of them fit comfortably.
const COMPONENTS: { key: keyof SealedRiseComponents; label: string }[] = [
  { key: "room", label: "Room" },
  { key: "scarcity", label: "Scarcity" },
  { key: "momentum", label: "Momentum" },
  { key: "volatility", label: "Volatility" },
];

function ConfidenceChip({ c }: { c: SealedRisePick["confidence"] }) {
  return (
    <span className={`chip ${c === "High" ? "bg-brand-500/15 text-brand-300" : c === "Medium" ? "bg-gold/15 text-gold" : "bg-ink-800 text-slate-400"}`}>
      {c}
    </span>
  );
}

// Links out to /sealed?q= rather than a per-product href — there is no
// /sealed/<slug> page (see SealedIndexConstituents.tsx's own comment).
function ProductCell({ p }: { p: SealedRisePick }) {
  return (
    <Link href={`/sealed?q=${encodeURIComponent(p.name)}`} className="flex items-center gap-2.5">
      {p.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt={sealedImageAlt(p.name)} loading="lazy" decoding="async" className="h-10 w-10 shrink-0 rounded-sm bg-ink-950 object-contain" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{p.name}</span>
        <span className="block text-[11px] text-slate-500">
          {p.productType}{p.setCode ? ` · ${p.setCode}` : ""}{p.overheated ? " · ⚠ hot" : ""}
        </span>
      </span>
    </Link>
  );
}

function RisingRow({ p, rank, currency }: { p: SealedRisePick; rank: number; currency: string }) {
  return (
    <tr className="hover:bg-ink-800">
      <td className="px-3 py-2 text-slate-500">{rank}</td>
      <td className="px-3 py-2">
        <ProductCell p={p} />
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
        <th className="px-3 py-2.5 font-semibold">Product</th>
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

function parseMarket(v?: string): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : DEFAULT_COUNTRY;
}

export default async function RisingSealedPage({ searchParams }: { searchParams: { market?: string } }) {
  const user = await getCurrentUser();
  const premium = isPremium(user);
  const market = parseMarket(searchParams.market);
  const currency = currencyOf(market);

  // Cached per market, shared between the free teaser and the full Premium view —
  // same day-key + 48h TTL as /tools/rising, and for the same reason: the
  // price-history half of the score is weekly, but the scarcity half reads live
  // in-stock counts that can change on any price import, so a week-scoped key
  // (like the Sealed Index's own cache) would under-refresh that half.
  const analysis = await unstable_cache(() => getRisingSealed(market), ["rising-sealed-public", market, sydneyDayKey()], {
    revalidate: 172800,
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
          <span className="text-slate-300">Rising Sealed</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Rising Sealed</h1>
          {premium && <MarketSwitcher value={market} basePath="/tools/rising-sealed" label="Choose the market Rising Sealed ranks" />}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Sealed products ranked by a composite of <strong className="text-slate-200">price-timing and supply signals</strong> —
          sitting near their own recent low, thin in-stock, not already spiking. Real data, transparent scoring. Not
          financial advice.{" "}
          <Link href="/market/sealed" className="text-brand-400 hover:underline">See the Sealed Index →</Link>
        </p>
      </div>

      {/* ADSENSE REVIEW MODE: see /tools/rising's identical note — the Premium
          gate lifts during review so no crawler-reachable, sitemapped page
          carries blurred/locked content. */}
      {!premium && !ADSENSE_REVIEW_MODE ? (
        <div className="card-surface overflow-hidden">
          <table className="w-full min-w-[560px] text-sm">
            <TableHead />
            <tbody className="divide-y divide-ink-800">
              {top ? (
                <RisingRow p={top} rank={1} currency={currency} />
              ) : (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">Not enough data yet — check back once a few weeks of sealed price history have built up.</td></tr>
              )}
            </tbody>
          </table>
          <div className="relative border-t border-ink-800">
            <ul className="divide-y divide-ink-800 blur-[5px]" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-center gap-2.5 px-4 py-3 opacity-60">
                  <div className="h-10 w-10 shrink-0 rounded-sm bg-ink-800" />
                  <div className="flex-1 space-y-1.5"><div className="h-2.5 w-2/5 rounded bg-ink-800" /><div className="h-2 w-1/4 rounded bg-ink-800" /></div>
                  <div className="h-3 w-10 rounded bg-ink-800" />
                </li>
              ))}
            </ul>
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-transparent to-ink-900/60 p-4 text-center">
              <div>
                <p className="text-sm font-bold text-white">Unlock the full Rising Sealed list</p>
                <p className="mx-auto mt-0.5 max-w-sm text-xs text-slate-400">
                  See every ranked product in every market, with the full signal breakdown — not just the top pick.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {user ? <PremiumButton /> : <Link href="/login?next=/tools/rising-sealed" className="btn-primary text-sm">Sign in free</Link>}
                  <Link href="/sealed" className="btn-ghost text-sm">Free sealed prices →</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : analysis.picks.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          {analysis.withAnyHistory > 0 ? (
            <div>
              <p className="font-semibold text-white">Signals are still building</p>
              <p className="mx-auto mt-1 max-w-lg">
                We track {analysis.withAnyHistory.toLocaleString()} sealed {analysis.withAnyHistory === 1 ? "product" : "products"} in{" "}
                {COUNTRIES[market].place}, but ranking them needs {analysis.minPointsRequired} weekly snapshots per product
                and the deepest one so far has {analysis.deepestSeries}. Check back in a few weeks.
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-white">No sealed price history yet in {COUNTRIES[market].place}</p>
              <p className="mt-1">Signals appear once weekly price snapshots have built up.</p>
            </div>
          )}
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
            Score is a 0–100 percentile of a weighted composite (room to run, scarcity, momentum, volatility) across the{" "}
            {analysis.qualifying} tracked sealed products in {COUNTRIES[market].place} with enough price history to
            score. Hover a signal bar for its exact z-score. A research signal, not advice — always sanity-check the
            product&apos;s own price history.
          </p>
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How Rising Sealed works</h2>
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
                { "@type": "ListItem", position: 3, name: "Rising Sealed", item: `${SITE_URL}/tools/rising-sealed` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Rising Sealed",
              url: `${SITE_URL}/tools/rising-sealed`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: currency },
              description: "Ranks Riftbound sealed products by price-timing and supply signals to surface ones likely to rise soon.",
            },
          ]),
        }}
      />
    </div>
  );
}
