import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import {
  RANGES,
  SOURCE_LABELS,
  dayIn,
  isRangeKey,
  rangeStart,
  seriesFor,
  tagBreakdown,
  totalFor,
  type EarningsSourceKey,
  type RangeKey,
  type SourceResult,
} from "@/lib/earnings/core";
import { EARNINGS_SINCE, loadEarnings } from "@/lib/earnings/sources";
import { loadCosts } from "@/lib/earnings/costs";
import { ManualEarningsForm } from "@/components/admin/ManualEarningsForm";
import { CostEntriesForm } from "@/components/admin/CostEntriesForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earnings",
  robots: { index: false, follow: false },
};

// ONE EARNINGS DASHBOARD (2026-10-24, owner). DECISIONS.md "One earnings
// dashboard". Every source's earnings — Stripe, TCGplayer (Impact), eBay Partner
// Network, AdSense, Mediavine — for today, 7, 30 and 90 days and all time, each
// on its own and combined. Every figure is read from the source's own reporting
// API (lib/earnings/sources.ts) or, for Mediavine, typed in below; combined
// totals convert at the site's reference rates (lib/fx.ts), so they are a guide,
// not an accounting figure.

const COLORS: Record<EarningsSourceKey, string> = {
  stripe: "#635bff",
  tcgplayer: "#2f80ed",
  ebay: "#e53238",
  adsense: "#fbbc04",
  mediavine: "#34d17e",
};
const DISPLAY = ["AUD", "USD"] as const;
const TAG_TITLE: Partial<Record<EarningsSourceKey, string>> = { ebay: "eBay", tcgplayer: "TCGplayer" };
const TAG_NOTE: Partial<Record<EarningsSourceKey, string>> = {
  ebay: "From eBay's transaction report, one row per sale.",
  tcgplayer: "From Impact's actions, by the click's sharedid; reversed actions left out.",
};

export default async function EarningsPage({ searchParams }: { searchParams: { key?: string; range?: string; cur?: string; fresh?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();
  const keyQ = keyOk && !me?.isAdmin ? `key=${encodeURIComponent(token!)}&` : "";

  const range: RangeKey = isRangeKey(searchParams.range) ? searchParams.range : "30d";
  const display = (DISPLAY as readonly string[]).includes(String(searchParams.cur)) ? String(searchParams.cur) : "AUD"; // the owner's currency (2026-10-25)
  const [sources, costs] = await Promise.all([loadEarnings(searchParams.fresh === "1"), loadCosts(searchParams.fresh === "1")]);
  const today = dayIn(Date.now());
  const money = (c: number) => formatMoney(c, display);
  const href = (p: { range?: RangeKey; cur?: string; fresh?: boolean }) =>
    `/admin/earnings?${keyQ}range=${p.range ?? range}&cur=${p.cur ?? display}${p.fresh ? "&fresh=1" : ""}`;

  const live = sources.filter((s) => s.status !== "not-configured" || s.days.length);
  const combined = (r: RangeKey) =>
    live.reduce(
      (acc, s) => {
        const t = totalFor(s.days, r, today, display);
        return { cents: acc.cents + t.cents, pendingCents: acc.pendingCents + t.pendingCents };
      },
      { cents: 0, pendingCents: 0 },
    );
  const series = seriesFor(live, range, today, display);
  const peak = Math.max(1, ...series.map((b) => Math.max(0, b.cents)));
  const sel = combined(range);
  // Costs and profit (2026-10-25): every cost line converted like the earnings.
  const costTotal = (r: RangeKey) => costs.reduce((n, c) => n + totalFor(c.days, r, today, display).cents, 0);
  const profit = (r: RangeKey) => combined(r).cents - costTotal(r);
  const manual = await prisma.manualEarning
    .findMany({ orderBy: { day: "desc" }, take: 50, select: { id: true, source: true, day: true, amountCents: true, currency: true, note: true } })
    .catch(() => []);
  const oldest = Math.min(...sources.map((s) => s.fetchedAt));
  // eBay by tracking tag (2026-10-25, owner): one EPN account, every site's links.
  // TCGplayer by tag (2026-10-26): Impact's sharedid, broken down the same way.
  const tagged = sources
    .filter((s) => s.tags && (s.key === "ebay" || s.key === "tcgplayer"))
    .map((s) => {
      const groups = tagBreakdown(s.tags!, range, today, display);
      return { s, groups, total: groups.reduce((n, g) => n + g.cents, 0) };
    });
  // Checking a total against the network's own dashboard (2026-10-25): the exact
  // days this range covers, and each source's pieces in the network's currency.
  const spanFrom = rangeStart(range, today) ?? EARNINGS_SINCE;
  const nativeText = (native: Record<string, number>) =>
    Object.entries(native)
      .filter(([, c]) => c)
      .map(([cur, c]) => formatMoney(c, cur))
      .join(" + ") || formatMoney(0, display);
  const checked = sources.filter((s) => s.checks?.length);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keyOk && !me?.isAdmin ? `?key=${encodeURIComponent(token!)}` : ""}`} className="hover:text-slate-300">
          Admin
        </Link>
        <span>/</span>
        <span className="text-slate-300">Earnings</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Earnings</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every source, on its own and combined, then costs and profit. Days are Sydney days; combined totals convert at the site&apos;s reference rates.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {DISPLAY.map((c) => (
            <Link key={c} href={href({ cur: c })} className={`rounded-lg px-2.5 py-1.5 font-bold ${c === display ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}>
              {c}
            </Link>
          ))}
          <Link href={href({ fresh: true })} className="btn-ghost px-3 py-1.5 text-xs" prefetch={false}>
            Refresh
          </Link>
        </div>
      </div>

      {/* Range tabs */}
      <div role="tablist" aria-label="Range" className="mt-5 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900/70 p-1">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            role="tab"
            aria-selected={r.key === range}
            href={href({ range: r.key })}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-bold ${r.key === range ? "bg-ink-800 text-white" : "text-slate-400 hover:bg-ink-800/60"}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* Combined headline for the picked range */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="card-surface space-y-3 rounded-2xl border border-ink-700 p-4 sm:col-span-1">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Earnings · {RANGES.find((r) => r.key === range)!.label}</div>
            <div className="num mt-1 text-3xl font-extrabold text-white">{money(sel.cents)}</div>
            {sel.pendingCents > 0 && <div className="mt-0.5 text-xs text-slate-400">incl. {money(sel.pendingCents)} pending approval</div>}
          </div>
          <div className="flex justify-between gap-2 border-t border-ink-700 pt-2 text-sm">
            <span className="text-slate-400">Costs</span>
            <span className="num font-bold text-slate-200">−{money(costTotal(range))}</span>
          </div>
          <div className="flex justify-between gap-2 text-sm" data-earnings-profit>
            <span className="font-bold text-white">Profit</span>
            <span className={`num text-lg font-extrabold ${profit(range) >= 0 ? "text-up" : "text-rose-400"}`}>{money(profit(range))}</span>
          </div>
        </div>
        <div className="card-surface rounded-2xl border border-ink-700 p-4 sm:col-span-2">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{range === "all" ? "By month" : "By day"}</div>
          {series.length ? (
            <div className="mt-2 flex h-28 items-end gap-px" aria-label="Combined earnings chart">
              {series.map((b) => (
                <div key={b.label} className="flex h-full flex-1 flex-col justify-end" title={`${b.label}: ${money(b.cents)}`}>
                  {(Object.keys(COLORS) as EarningsSourceKey[]).map((k) => {
                    const v = Math.max(0, b.bySource[k] ?? 0);
                    return v ? <div key={k} style={{ height: `${(v / peak) * 100}%`, background: COLORS[k] }} /> : null;
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No earnings in this range yet.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
            {(Object.keys(COLORS) as EarningsSourceKey[]).map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[k] }} />
                {SOURCE_LABELS[k]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Every source × every range, and the combined row */}
      <div className="card-surface mt-4 overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2.5">Source</th>
              {RANGES.map((r) => (
                <th key={r.key} className={`px-3 py-2.5 text-right ${r.key === range ? "text-white" : ""}`}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <SourceRow key={s.key} s={s} today={today} display={display} range={range} money={money} />
            ))}
            <tr className="bg-ink-800/50 font-extrabold text-white">
              <td className="px-3 py-2.5">Combined</td>
              {RANGES.map((r) => (
                <td key={r.key} className="num px-3 py-2.5 text-right">
                  {money(combined(r.key).cents)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* eBay and TCGplayer by tracking tag: site prefix, then each full tag */}
      {tagged.map(({ s, groups, total }) => (
        <section key={s.key} className="card-surface mt-4 rounded-2xl border border-ink-700 p-4" data-ebay-tags={s.key === "ebay" ? "" : undefined} data-source-tags={s.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-extrabold text-white">
              {TAG_TITLE[s.key]} by tag · {RANGES.find((r) => r.key === range)!.label}
            </h2>
            <span className="text-xs text-slate-400">{TAG_NOTE[s.key]} Open a site to see each tag.</span>
          </div>
          {groups.length ? (
            <div className="mt-3 divide-y divide-ink-800 rounded-xl border border-ink-700 text-sm">
              {groups.map((g) => (
                <details key={g.key || "none"} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 hover:bg-ink-800/40 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="text-slate-500 transition-transform group-open:rotate-90">›</span>
                    <span className="flex-1">
                      <span className="font-semibold text-white">{g.label}</span>
                      <span className="ml-2 font-mono text-[11px] text-slate-500">{g.key ? `${g.key}…` : "(none)"}</span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {g.sales} {g.sales === 1 ? "sale" : "sales"}
                    </span>
                    <span className="w-12 text-right text-xs text-slate-400">{total ? Math.round((g.cents / total) * 100) : 0}%</span>
                    <span className="num w-28 text-right font-bold text-white">{money(g.cents)}</span>
                  </summary>
                  <ul className="border-t border-ink-800 bg-ink-900/60 px-3 py-2">
                    {g.tags.map((t) => (
                      <li key={t.tag || "none"} className="flex items-center gap-3 py-1 pl-6 text-xs">
                        <span className="flex-1 font-mono text-slate-300">{t.tag || "(no tag)"}</span>
                        <span className="text-slate-500">{t.sales}</span>
                        <span className="num w-28 text-right text-slate-200">
                          {money(t.cents)}
                          {t.pendingCents > 0 ? <span className="ml-1 text-slate-500">({money(t.pendingCents)} pending)</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No {TAG_TITLE[s.key]} sales in this range.</p>
          )}
        </section>
      ))}
      {/* Each network's pieces, to match against its own dashboard */}
      {checked.length > 0 && (
        <section className="card-surface mt-4 rounded-2xl border border-ink-700 p-4" data-earnings-checks>
          <h2 className="text-sm font-extrabold text-white">Check against each network&apos;s dashboard</h2>
          <p className="mt-1 text-xs text-slate-400">
            {RANGES.find((r) => r.key === range)!.label} = {spanFrom} to {today} (Sydney days; eBay and AdSense dates are in their own time zone). Set the same dates on the network&apos;s dashboard. Amounts are in the network&apos;s own currency, unconverted.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {checked.map((s) => (
              <div key={s.key} className="rounded-xl border border-ink-700 p-3 text-sm">
                <div className="flex justify-between gap-2 font-semibold text-white">
                  <span>{SOURCE_LABELS[s.key]}</span>
                  <span className="num">{nativeText(totalFor(s.days, range, today, display).native)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {s.checks!.map((c) => (
                    <li key={c.label} className="flex justify-between gap-2">
                      <span className={c.counted ? "text-slate-300" : "text-slate-500"}>{c.label}</span>
                      <span className={`num ${c.counted ? "text-slate-200" : "text-slate-500"}`}>{nativeText(totalFor(c.days, range, today, display).native)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* Costs × every range, then profit */}
      <div className="card-surface mt-4 overflow-x-auto rounded-2xl border border-ink-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2.5">Cost</th>
              {RANGES.map((r) => (
                <th key={r.key} className={`px-3 py-2.5 text-right ${r.key === range ? "text-white" : ""}`}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => {
              const off = c.status !== "ok" && !c.days.length;
              return (
                <tr key={c.key} className="border-b border-ink-800">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-slate-200">{c.label}</span>
                    <span className="ml-2 text-[11px] text-slate-500">
                      {c.category}
                      {c.entry ? ` · ${c.entry.recurrence === "once" ? "one-off" : c.entry.recurrence}${c.entry.endDay ? `, ended ${c.entry.endDay}` : ""}` : c.status === "ok" ? " · automatic" : ""}
                    </span>
                  </td>
                  {RANGES.map((r) => (
                    <td key={r.key} className={`num px-3 py-2.5 text-right ${off ? "text-slate-600" : r.key === range ? "text-white" : "text-slate-300"}`}>
                      {off ? "—" : money(totalFor(c.days, r.key, today, display).cents)}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="bg-ink-800/50 font-bold text-slate-200">
              <td className="px-3 py-2.5">Total costs</td>
              {RANGES.map((r) => (
                <td key={r.key} className="num px-3 py-2.5 text-right">
                  {money(costTotal(r.key))}
                </td>
              ))}
            </tr>
            <tr className="font-extrabold text-white">
              <td className="px-3 py-2.5">Profit (earnings − costs)</td>
              {RANGES.map((r) => (
                <td key={r.key} className={`num px-3 py-2.5 text-right ${profit(r.key) >= 0 ? "text-up" : "text-rose-400"}`}>
                  {money(profit(r.key))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        All time = since {EARNINGS_SINCE}. Data refreshes every 30 minutes (oldest read {new Date(oldest).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit" })} Sydney). Stripe is net of fees and refunds; TCGplayer and eBay include pending commissions until approved (reversed ones excluded); AdSense is its estimate.
      </p>

      {/* Setup and status, per source */}
      <section className="mt-8">
        <h2 className="text-lg font-extrabold text-white">Connections</h2>
        <ul className="mt-2 space-y-2">
          {sources.map((s) => (
            <li key={s.key} className="card-surface flex flex-wrap items-start justify-between gap-2 rounded-xl border border-ink-700 px-4 py-3 text-sm">
              <span className="font-semibold text-white">{SOURCE_LABELS[s.key]}</span>
              <span className={s.status === "ok" ? "text-up" : s.status === "error" ? "text-rose-400" : "text-slate-400"}>
                {s.status === "ok" ? "Connected" : s.status === "error" ? "Error" : "Not connected"}
                {s.detail ? <span className="ml-2 text-xs text-slate-400">{s.detail}</span> : null}
              </span>
            </li>
          ))}
          {costs
            .filter((c) => !c.entry)
            .map((c) => (
              <li key={c.key} className="card-surface flex flex-wrap items-start justify-between gap-2 rounded-xl border border-ink-700 px-4 py-3 text-sm">
                <span className="font-semibold text-white">{c.label} (cost)</span>
                <span className={c.status === "ok" ? "text-up" : c.status === "error" ? "text-rose-400" : "text-slate-400"}>
                  {c.status === "ok" ? "Connected" : c.status === "error" ? "Error" : "Not connected"}
                  {c.detail ? <span className="ml-2 text-xs text-slate-400">{c.detail}</span> : null}
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-extrabold text-white">Costs</h2>
        <p className="mt-1 text-sm text-slate-400">
          One-off costs (ads, a domain) and repeating ones (Vercel Pro, your Claude plan). Changed plan? Stop the old entry and add the new one, so past months keep the old price.
        </p>
        <CostEntriesForm
          entries={costs.flatMap((c) => (c.entry ? [c.entry] : []))}
          adminKey={keyOk && !me?.isAdmin ? token! : null}
          today={today}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-extrabold text-white">Mediavine (entered by hand)</h2>
        <p className="mt-1 text-sm text-slate-400">
          Mediavine has no reporting API. Copy each day&apos;s (or month&apos;s) earnings from the Mediavine dashboard here and they join the totals above.
        </p>
        <ManualEarningsForm entries={manual} adminKey={keyOk && !me?.isAdmin ? token! : null} />
      </section>
    </div>
  );
}

function SourceRow({
  s,
  today,
  display,
  range,
  money,
}: {
  s: SourceResult;
  today: string;
  display: string;
  range: RangeKey;
  money: (c: number) => string;
}) {
  // Not set up, or failing with nothing cached: a dash, never a misleading $0.00.
  const off = s.status !== "ok" && !s.days.length;
  return (
    <tr className="border-b border-ink-800">
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2 font-semibold text-slate-200">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[s.key] }} />
          {SOURCE_LABELS[s.key]}
        </span>
      </td>
      {RANGES.map((r) => {
        if (off) return <td key={r.key} className="px-3 py-2.5 text-right text-slate-600">—</td>;
        const t = totalFor(s.days, r.key, today, display);
        const natives = Object.entries(t.native).filter(([c]) => c !== display);
        return (
          <td key={r.key} className={`num px-3 py-2.5 text-right ${r.key === range ? "text-white" : "text-slate-300"}`}>
            {money(t.cents)}
            {t.pendingCents > 0 && <div className="text-[10px] text-slate-500">{money(t.pendingCents)} pending</div>}
            {natives.length > 0 && <div className="text-[10px] text-slate-500">{natives.map(([c, v]) => formatMoney(v, c)).join(" + ")}</div>}
          </td>
        );
      })}
    </tr>
  );
}
