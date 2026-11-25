import { itemLabel, type ClickItem, type TopClicks, type TopItem } from "@/lib/earnings/top-items";

// "What's selling" on /admin/earnings (2026-11-25, owner; lib/earnings/top-items.ts).
// Sales and clicks are two tables with two labels: a sale is the network saying
// someone bought it; a click is someone leaving us for a store.

interface Props {
  rangeLabel: string;
  products: TopItem[];
  sets: TopItem[];
  coverage: { network: string; rows: number | null }[];
  amazonNote: string;
  clicked: (ClickItem & { site: string; label: string })[];
  clicks: TopClicks | null;
  money: (c: number) => string;
}

const th = "px-3 py-2";
const num = "num px-3 py-1.5 text-right";

function SalesTable({ rows, first, money }: { rows: TopItem[]; first: string; money: (c: number) => string }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
            <th className={th}>{first}</th>
            <th className={th}>Sold via</th>
            <th className={th}>Site</th>
            <th className={`${th} text-right`}>Orders</th>
            <th className={`${th} text-right`}>Units</th>
            <th className={`${th} text-right`}>Sale value</th>
            <th className={`${th} text-right`}>We earned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-ink-800 last:border-0">
              <td className="max-w-[320px] truncate px-3 py-1.5 text-slate-200" title={r.name}>
                {r.name}
              </td>
              <td className="px-3 py-1.5 text-xs text-slate-400">{r.networks.join(", ")}</td>
              <td className="max-w-[160px] truncate px-3 py-1.5 text-xs text-slate-400" title={r.sites.join(", ")}>
                {r.sites.join(", ") || "No tag"}
              </td>
              <td className={num}>{r.orders}</td>
              <td className={num}>{r.units}</td>
              <td className={num}>{r.saleCents ? money(r.saleCents) : "—"}</td>
              <td className={`${num} font-bold text-white`}>{money(r.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WhatsSelling({ rangeLabel, products, sets, coverage, amazonNote, clicked, clicks, money }: Props) {
  const viewSites = clicks?.sites.filter((s) => s.kind === "views" && s.items.length) ?? [];
  return (
    <section className="card-surface mt-4 rounded-2xl border border-ink-700 p-4" data-earnings-selling>
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">What&apos;s selling · {rangeLabel}</div>
      <p className="mt-1 text-xs text-slate-400">
        <b className="text-slate-200">Sales</b> are orders the networks reported, item by item, from every site&apos;s links:{" "}
        {coverage.map((c) => `${c.network} ${c.rows == null ? "not read yet" : `${c.rows} item rows`}`).join(" · ")}. {amazonNote}
      </p>

      <h3 className="mt-3 text-sm font-bold text-white">Top products sold</h3>
      {products.length ? <SalesTable rows={products} first="Product" money={money} /> : <p className="mt-1 text-sm text-slate-500">No item-level sales in this range yet.</p>}

      <h3 className="mt-4 text-sm font-bold text-white">Top sets sold</h3>
      <p className="text-xs text-slate-500">No network says which set an item is from, so the set is the product&apos;s name with the box, pack and bundle words taken off: a best guess.</p>
      {sets.length ? <SalesTable rows={sets} first="Set" money={money} /> : <p className="mt-1 text-sm text-slate-500">No sets in this range yet.</p>}

      <h3 className="mt-4 text-sm font-bold text-white">Most clicked · buy clicks, not sales</h3>
      <p className="text-xs text-slate-500">
        Visitors who pressed a buy button for the item, last 28 and 7 days, every site
        {clicks ? `, read ${new Date(clicks.fetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}. A click is demand, not an order.
      </p>
      {clicked.length ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
                <th className={th}>Item</th>
                <th className={th}>Site</th>
                <th className={`${th} text-right`}>Clicks 28d</th>
                <th className={`${th} text-right`}>Clicks 7d</th>
              </tr>
            </thead>
            <tbody>
              {clicked.map((c) => (
                <tr key={`${c.site}|${c.key}`} className="border-b border-ink-800 last:border-0">
                  <td className="max-w-[360px] truncate px-3 py-1.5 text-slate-200" title={c.key}>
                    {itemLabel(c.key)}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{c.label}</td>
                  <td className={num}>{c.d28}</td>
                  <td className={num}>{c.d7}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-1 text-sm text-slate-500">{clicks ? "No buy clicks recorded." : "Not read yet: the earnings refresh reads every site's clicks once a day."}</p>
      )}
      {viewSites.length > 0 && (
        <details className="mt-2 text-xs text-slate-400">
          <summary className="cursor-pointer">Sites that send no buy-click events: their most viewed product pages instead ({viewSites.map((s) => s.label).join(", ")})</summary>
          <ul className="mt-1 space-y-0.5">
            {viewSites.map((s) => (
              <li key={s.site}>
                <b className="text-slate-300">{s.label}</b> (page views 28d): {s.items.slice(0, 5).map((i) => `${itemLabel(i.key)} ${i.d28}`).join(" · ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
