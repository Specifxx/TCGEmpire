import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store repricing report",
  robots: { index: false, follow: false }, // capability-URL page, never indexed
};

// The B2B product: a partner store's live "you vs the market" repricing report,
// unlocked by the secret token in their capability URL. Compares every in-stock
// listing of theirs against the market's cheapest in the same country/printing.
export default async function StoreReportPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = (searchParams.token ?? "").trim();
  const partner = token ? await prisma.storePartner.findUnique({ where: { token } }) : null;

  if (!partner) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-3xl" aria-hidden>🔒</p>
        <h1 className="mt-2 text-xl font-extrabold text-white">This report link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-slate-400">
          Check the link we emailed you, or request access for your store.
        </p>
        <Link href="/stores" className="btn-primary mt-4 inline-block">RiftCompare for Stores →</Link>
      </div>
    );
  }

  // The store's in-stock listings + every competing in-stock listing for the same
  // cards in the same market.
  const mine = await prisma.retailerPrice.findMany({
    where: { retailer: partner.retailer, inStock: true },
    select: {
      cardId: true, priceCents: true, country: true, isFoil: true, condition: true, lastSeen: true,
      card: { select: { name: true, slug: true, id: true, setCode: true, collectorNumber: true } },
    },
  });
  const cardIds = [...new Set(mine.map((m) => m.cardId))];
  const rivals = cardIds.length
    ? await prisma.retailerPrice.findMany({
        where: { cardId: { in: cardIds }, inStock: true, NOT: { retailer: partner.retailer } },
        select: { cardId: true, priceCents: true, country: true, isFoil: true, retailerName: true },
      })
    : [];

  // Cheapest rival per (card, country, finish) — foils compete with foils.
  const bestRival = new Map<string, { priceCents: number; retailerName: string }>();
  for (const r of rivals) {
    const k = `${r.cardId}|${r.country}|${r.isFoil}`;
    const cur = bestRival.get(k);
    if (!cur || r.priceCents < cur.priceCents) bestRival.set(k, { priceCents: r.priceCents, retailerName: r.retailerName });
  }

  type Row = {
    name: string; href: string; sub: string; country: string;
    mineCents: number; rivalCents: number; rivalName: string; gapPct: number;
  };
  let winning = 0;
  let unchallenged = 0;
  const losing: Row[] = [];
  const headroom: Row[] = [];
  for (const m of mine) {
    const rival = bestRival.get(`${m.cardId}|${m.country}|${m.isFoil}`);
    if (!rival) { unchallenged++; continue; }
    const gapPct = Math.round(((m.priceCents - rival.priceCents) / rival.priceCents) * 100);
    const row: Row = {
      name: m.card.name,
      href: `/card/${m.card.slug ?? m.card.id}`,
      sub: `${m.card.setCode} ${m.card.collectorNumber}${m.isFoil ? " · ✦ Foil" : ""}${m.condition ? ` · ${m.condition}` : ""}`,
      country: m.country,
      mineCents: m.priceCents,
      rivalCents: rival.priceCents,
      rivalName: rival.retailerName,
      gapPct,
    };
    if (m.priceCents <= rival.priceCents) {
      winning++;
      // Cheapest by a wide margin = room to raise the price and still win.
      if (gapPct <= -10) headroom.push(row);
    } else {
      losing.push(row);
    }
  }
  losing.sort((a, b) => b.gapPct - a.gapPct);
  headroom.sort((a, b) => a.gapPct - b.gapPct);
  const contested = winning + losing.length;
  const winRate = contested > 0 ? Math.round((winning / contested) * 100) : null;
  const updated = mine.reduce<Date | null>((m, r) => (!m || r.lastSeen > m ? r.lastSeen : m), null);

  const Money = ({ cents }: { cents: number }) => <>{formatMoney(cents)}</>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip mb-1 inline-flex bg-brand-500/15 text-[10px] font-bold uppercase tracking-wide text-brand-300">
            Partner report · private
          </span>
          <h1 className="font-display text-2xl font-extrabold text-white">{partner.name} — you vs the market</h1>
          <p className="mt-1 text-sm text-slate-400">
            Live comparison of your in-stock singles against every store RiftCompare tracks.
            {updated && <> Updated {updated.toLocaleString()}.</>}
          </p>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "In-stock listings", value: mine.length.toLocaleString() },
          { label: "Cheapest in market", value: winning.toLocaleString(), tone: "text-brand-400" },
          { label: "Beaten on price", value: losing.length.toLocaleString(), tone: "text-rose-400" },
          { label: "Win rate", value: winRate != null ? `${winRate}%` : "—", tone: "text-gold" },
        ].map((s) => (
          <div key={s.label} className="card-surface p-4 text-center">
            <div className={`text-2xl font-extrabold ${s.tone ?? "text-white"}`}>{s.value}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Reprice opportunities */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-extrabold text-white">🎯 Reprice to win ({losing.length})</h2>
        <p className="mb-3 text-xs text-slate-500">Your listings priced above the market&apos;s cheapest — biggest gaps first.</p>
        {losing.length === 0 ? (
          <p className="card-surface p-6 text-center text-sm text-brand-300">Nothing to fix — you&apos;re never beaten right now. 🏆</p>
        ) : (
          <ReportTable
            rows={losing.slice(0, 75)}
            gapLabel="Over by"
            gapClass="text-rose-400"
          />
        )}
      </section>

      {/* Headroom */}
      <section className="mb-8">
        <h2 className="mb-1 text-lg font-extrabold text-white">💰 Margin headroom ({headroom.length})</h2>
        <p className="mb-3 text-xs text-slate-500">
          You&apos;re cheapest by 10%+ on these — you could raise the price and still win the comparison.
        </p>
        {headroom.length === 0 ? (
          <p className="card-surface p-6 text-center text-sm text-slate-500">No wide-margin wins right now.</p>
        ) : (
          <ReportTable rows={headroom.slice(0, 50)} gapLabel="Under by" gapClass="text-brand-400" />
        )}
      </section>

      <p className="text-center text-[11px] text-slate-600">
        {unchallenged > 0 && <>{unchallenged} of your listings have no competing in-stock listing (uncontested). </>}
        Prices refresh with RiftCompare&apos;s daily import. Questions or feedback:{" "}
        <Link href="/contact" className="text-brand-400 hover:underline">contact us</Link>.
      </p>
    </div>
  );

  function ReportTable({ rows, gapLabel, gapClass }: { rows: Row[]; gapLabel: string; gapClass: string }) {
    return (
      <div className="card-surface overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Card</th>
              <th className="px-2 py-2.5 font-semibold">Market</th>
              <th className="px-2 py-2.5 text-right font-semibold">Your price</th>
              <th className="px-2 py-2.5 text-right font-semibold">Cheapest rival</th>
              <th className="px-4 py-2.5 text-right font-semibold">{gapLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-ink-900/50">
                <td className="px-4 py-2">
                  <Link href={r.href} className="font-semibold text-white hover:text-brand-300">{r.name}</Link>
                  <span className="block text-[11px] text-slate-500">{r.sub}</span>
                </td>
                <td className="px-2 py-2 text-xs text-slate-400">{r.country}</td>
                <td className="px-2 py-2 text-right font-semibold text-white"><Money cents={r.mineCents} /></td>
                <td className="px-2 py-2 text-right text-slate-300">
                  <Money cents={r.rivalCents} /> <span className="block text-[10px] text-slate-500">{r.rivalName}</span>
                </td>
                <td className={`px-4 py-2 text-right font-extrabold ${gapClass}`}>{Math.abs(r.gapPct)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
