import Link from "next/link";
import { prisma } from "@/lib/db";
import { COUNTRIES, priceField, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { RETAILERS } from "@/lib/retailers";
import { cardHref } from "@/lib/card-url";

// ─────────────────────────────────────────────────────────────────────────────
// A live, market-specific data section appended to a buying guide.
// ─────────────────────────────────────────────────────────────────────────────
// The audit found six "buy Riftbound cards in <country>" posts sitting at
// 340–365 words each with 50–83% title overlap. Their BODIES are genuinely
// different (measured: 0.01–0.32 shingle similarity, so not a doorway cluster),
// but they were thin, and a family of same-shaped geo posts is the pattern a
// reviewer treats as one article with the country swapped.
//
// This is the honest fix: instead of padding them with more prose, each one
// carries the real, current, market-specific data we already hold — the stores
// actually stocking cards in that market today, what the cheapest of them is
// charging, and what the range looks like. That is information that exists
// nowhere else, differs genuinely between markets, and is true on the day it is
// read rather than the day it was written.
//
// Fails quietly: a database problem renders nothing rather than an error or an
// empty shell, and the article's own prose stands on its own without it.
export async function ArticleMarketData({ country }: { country: Country }) {
  const info = COUNTRIES[country];
  const field = priceField(country);

  const [stocked, cheapest, priciest, total] = await Promise.all([
    prisma.retailerPrice.groupBy({
      by: ["retailer"],
      where: { country, inStock: true },
      _count: { _all: true },
      _min: { priceCents: true },
    }).catch(() => []),
    prisma.card.findMany({
      where: { [field]: { not: null } } as Record<string, unknown>,
      orderBy: { [field]: "asc" } as Record<string, "asc">,
      take: 5,
      select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true, [field]: true } as Record<string, boolean>,
    }).catch(() => []),
    prisma.card.findMany({
      where: { [field]: { not: null } } as Record<string, unknown>,
      orderBy: { [field]: "desc" } as Record<string, "desc">,
      take: 5,
      select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true, [field]: true } as Record<string, boolean>,
    }).catch(() => []),
    prisma.card.count({ where: { [field]: { not: null } } as Record<string, unknown> }).catch(() => 0),
  ]);

  const rows = (stocked as { retailer: string; _count: { _all: number }; _min: { priceCents: number | null } }[])
    .filter((r) => RETAILERS[r.retailer])
    .sort((a, b) => b._count._all - a._count._all);
  if (!rows.length || !total) return null;

  const price = (c: unknown) => (c as Record<string, number | null>)[field] ?? null;
  const cheap = cheapest as unknown as Record<string, unknown>[];
  const dear = priciest as unknown as Record<string, unknown>[];
  const listingTotal = rows.reduce((n, r) => n + r._count._all, 0);

  return (
    <section className="mt-10 rounded-xl border border-ink-700 bg-ink-900/40 p-5">
      <h2 className="text-lg font-bold text-white">
        {info.adjective} stores stocking Riftbound right now
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        This section is generated from our own price data rather than written by hand, so it is
        current rather than as-of-publication. Right now we are tracking{" "}
        <strong className="text-slate-200">{listingTotal.toLocaleString()}</strong> in-stock listings
        across <strong className="text-slate-200">{rows.length}</strong>{" "}
        {rows.length === 1 ? "store" : "stores"} in {info.place}, covering{" "}
        <strong className="text-slate-200">{total.toLocaleString()}</strong> priced cards. Prices are
        in {info.currency} and refresh daily.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-semibold">Store</th>
              <th className="px-2 py-2 text-right font-semibold">In-stock listings</th>
              <th className="py-2 pl-2 text-right font-semibold">Cheapest card</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows.slice(0, 12).map((r) => (
              <tr key={r.retailer}>
                <td className="py-2 pr-3">
                  <Link href={`/stores/${RETAILERS[r.retailer].key}`} className="text-brand-400 hover:underline">
                    {RETAILERS[r.retailer].name}
                  </Link>
                </td>
                <td className="num px-2 py-2 text-right text-slate-300">{r._count._all.toLocaleString()}</td>
                <td className="num py-2 pl-2 text-right text-slate-300">
                  {r._min.priceCents != null ? formatMoney(r._min.priceCents, info.currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 12 && (
          <p className="mt-2 text-xs text-slate-500">
            …and {rows.length - 12} more —{" "}
            <Link href="/stores/tracked" className="text-brand-400 hover:underline">see every store we track</Link>.
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {cheap.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-white">Cheapest cards in {info.place} today</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {cheap.map((c) => (
                <li key={String(c.id)} className="flex justify-between gap-3">
                  <Link href={cardHref(c as never)} className="truncate text-brand-400 hover:underline">
                    {String(c.name)}
                  </Link>
                  <span className="num shrink-0 text-slate-400">
                    {price(c) != null ? formatMoney(price(c)!, info.currency) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dear.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-white">Most expensive in {info.place} today</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {dear.map((c) => (
                <li key={String(c.id)} className="flex justify-between gap-3">
                  <Link href={cardHref(c as never)} className="truncate text-brand-400 hover:underline">
                    {String(c.name)}
                  </Link>
                  <span className="num shrink-0 text-slate-400">
                    {price(c) != null ? formatMoney(price(c)!, info.currency) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        How these figures are collected, how often they refresh and how to report one that&rsquo;s
        wrong: <Link href="/editorial-policy" className="text-brand-400 hover:underline">our editorial &amp; pricing policy</Link>.
      </p>
    </section>
  );
}
