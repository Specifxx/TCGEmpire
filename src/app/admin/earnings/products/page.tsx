import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { dayIn, type TagDay } from "@/lib/earnings/core";
import { loadEarnings } from "@/lib/earnings/sources";
import { allItems } from "@/lib/earnings/top-items";
import { loadProductClicks, storeProductClicks } from "@/lib/earnings/product-clicks";
import { PRODUCT_SITES, isProductSite, perClick, productEarnings, retailerNetwork, type NetCell, type ProductRow, type ProductSite, type SiteProductClicks } from "@/lib/earnings/product-earnings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Earnings by product",
  robots: { index: false, follow: false },
};

// EARNINGS, SALES AND CLICKS BY PRODUCT AND SET (owner, 2026-11-26), DexCompare and MTG
// Compare, last 30 days, TCGplayer and eBay side by side, plus Amazon clicks. Read only:
// it reads the earnings dashboard's stored copy (lib/earnings/stored.ts) and the stored
// clicks (lib/earnings/product-clicks.ts); nothing here writes to either site.
// How sales and clicks are joined, and what cannot be: lib/earnings/product-earnings.ts.

const DISPLAY = ["AUD", "USD"] as const;
const SITE_URL: Record<ProductSite, string> = { mtg: "https://mtgcompare.app", dex: "https://dexcompare.io" };
const th = "px-2 py-2";
const num = "num px-2 py-1.5 text-right";

export default async function ProductEarningsPage({ searchParams }: { searchParams: { key?: string; site?: string; cur?: string; fresh?: string; all?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();
  const keyQ = keyOk && !me?.isAdmin ? `key=${encodeURIComponent(token!)}&` : "";

  const site: ProductSite = isProductSite(searchParams.site) ? searchParams.site : "mtg";
  const siteLabel = PRODUCT_SITES.find((s) => s.key === site)!.label;
  const display = (DISPLAY as readonly string[]).includes(String(searchParams.cur)) ? String(searchParams.cur) : "AUD";
  const showAll = searchParams.all === "1";
  const href = (p: { site?: ProductSite; cur?: string; fresh?: boolean; all?: boolean }) =>
    `/admin/earnings/products?${keyQ}site=${p.site ?? site}&cur=${p.cur ?? display}${(p.all ?? showAll) ? "&all=1" : ""}${p.fresh ? "&fresh=1" : ""}`;
  const money = (c: number) => formatMoney(c, display);

  if (searchParams.fresh === "1") await storeProductClicks(true).catch(() => null);
  const [sources, stored] = await Promise.all([loadEarnings(false), loadProductClicks().catch(() => null)]);
  const today = dayIn(Date.now());
  const clicks = stored?.sites.find((s) => s.site === site) ?? null;
  const tagsOf = (k: "ebay" | "tcgplayer"): readonly TagDay[] => sources.find((s) => s.key === k)?.tags ?? [];
  const view = productEarnings({ site, items: allItems(sources), tags: { tcgplayer: tagsOf("tcgplayer"), ebay: tagsOf("ebay") }, clicks, range: "30d", today, display });
  const g = view.gaps;
  const itemRead = (k: "ebay" | "tcgplayer") => sources.find((s) => s.key === k)?.items != null;
  const products = showAll ? view.products : view.products.slice(0, 150);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const net = (k: "tcgplayer" | "ebay", label: string, c: NetCell) => {
    const clicksNet = g.netClicks[k];
    return (
      <div className="card-surface rounded-2xl border border-ink-700 p-4" key={k}>
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{label} · 30 days</div>
        <div className="num mt-1 text-2xl font-extrabold text-white">{money(g.taggedCents[k])}</div>
        <div className="text-xs text-slate-400">
          earned under {siteLabel}&apos;s tags · {g.taggedSales[k]} sales
        </div>
        <dl className="mt-3 space-y-1 text-xs text-slate-300">
          <div className="flex justify-between gap-2">
            <dt>Named item rows in this view</dt>
            <dd className="num">
              {itemRead(k) ? `${money(c.cents)} · ${c.orders} orders (${pct(c.cents, g.taggedCents[k])} of earned)` : "not read yet"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Buy clicks on product pages</dt>
            <dd className="num">{clicksNet ? `${clicksNet.onProduct} of ${clicksNet.total}` : clicks ? "not split by Vercel" : "not read yet"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Earned per product-page click</dt>
            <dd className="num">{perClick(c) != null ? money(perClick(c)!) : "—"}</dd>
          </div>
        </dl>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Link href={`/admin${keyQ ? `?${keyQ.slice(0, -1)}` : ""}`} className="hover:text-slate-300">
          Admin
        </Link>
        <span>/</span>
        <Link href={`/admin/earnings${keyQ ? `?${keyQ.slice(0, -1)}` : ""}`} className="hover:text-slate-300">
          Earnings
        </Link>
        <span>/</span>
        <span className="text-slate-300">By product</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Earnings by product and set</h1>
          <p className="mt-1 text-sm text-slate-400">
            {siteLabel}, last 30 days ({today} back), TCGplayer and eBay side by side, plus Amazon clicks. Read only. Amounts are our commission, converted at the site&apos;s reference rates.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {DISPLAY.map((c) => (
            <Link key={c} href={href({ cur: c })} className={`rounded-lg px-2.5 py-1.5 font-bold ${c === display ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}>
              {c}
            </Link>
          ))}
          <Link href={href({ fresh: true })} className="btn-ghost px-3 py-1.5 text-xs" prefetch={false}>
            Re-read clicks
          </Link>
        </div>
      </div>

      <div role="tablist" aria-label="Site" className="mt-5 flex gap-1 rounded-xl border border-ink-700 bg-ink-900/70 p-1">
        {PRODUCT_SITES.map((s) => (
          <Link
            key={s.key}
            role="tab"
            aria-selected={s.key === site}
            href={href({ site: s.key })}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-bold ${s.key === site ? "bg-ink-800 text-white" : "text-slate-400 hover:bg-ink-800/60"}`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {net("tcgplayer", "TCGplayer", view.totals.tcgplayer)}
        {net("ebay", "eBay", view.totals.ebay)}
        <div className="card-surface rounded-2xl border border-ink-700 p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Amazon · 30 days</div>
          <div className="num mt-1 text-2xl font-extrabold text-white">{g.netClicks.amazon ? g.netClicks.amazon.total : "—"}</div>
          <div className="text-xs text-slate-400">buy clicks ({g.netClicks.amazon ? `${g.netClicks.amazon.onProduct} on product pages` : clicks ? "not split by Vercel" : "not read yet"})</div>
          <p className="mt-3 text-xs text-slate-400">Clicks only: Amazon reports earnings per tracking ID and per store, never per site or per product, so its earnings stay on the main dashboard.</p>
        </div>
      </div>

      <Status clicks={clicks} fetchedAt={stored?.fetchedAt ?? null} />

      <section className="card-surface mt-4 rounded-2xl border border-ink-700 p-4" data-earnings-by-set>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">By set · {view.sets.length} sets</h2>
        <p className="mt-1 text-xs text-slate-500">
          A product&apos;s set is its set code in {siteLabel}&apos;s catalogue; products without one group by product type. Sales no product matched are grouped by the set their title names, marked &quot;unmatched&quot;.
        </p>
        <Table rows={view.sets} first="Set" money={money} site={site} showSet={false} />
      </section>

      <section className="card-surface mt-4 rounded-2xl border border-ink-700 p-4" data-earnings-by-product>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          By product · {view.products.length} products{!showAll && view.products.length > products.length ? `, top ${products.length} shown` : ""}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Ordered by earnings, then orders, then clicks. A sale is matched to a product when every word of the product&apos;s name is in the sale&apos;s title and no other product fits as well; a sale with no unique fit is listed under its own title, with no page link.
        </p>
        <Table rows={products} first="Product" money={money} site={site} showSet />
        {!showAll && view.products.length > products.length && (
          <Link href={href({ all: true })} className="mt-2 inline-block text-xs text-slate-400 underline hover:text-white" prefetch={false}>
            Show all {view.products.length}
          </Link>
        )}
      </section>

      <section className="card-surface mt-4 rounded-2xl border border-ink-700 p-4 text-sm text-slate-300" data-earnings-gaps>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">What this view cannot attribute</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs">
          <li>
            <b>Untagged sales.</b> eBay: {g.untagged.ebay.sales} sales, {money(g.untagged.ebay.cents)} with no customid in 30 days (every site together); TCGplayer: {g.untagged.tcgplayer.sales} sales, {money(g.untagged.tcgplayer.cents)} with no sharedid.
            Of the untagged ones that name their item, {g.untagged.ebay.gameSales + g.untagged.tcgplayer.gameSales} ({money(g.untagged.ebay.gameCents + g.untagged.tcgplayer.gameCents)}) look like {PRODUCT_SITES.find((s) => s.key === site)!.game} product, but RiftCompare and TCG Prices sell those too, so none is counted for {siteLabel}.
          </li>
          <li>
            <b>Tagged sales without an item name.</b> TCGplayer {money(Math.max(0, g.taggedCents.tcgplayer - g.itemCents.tcgplayer))}, eBay {money(Math.max(0, g.taggedCents.ebay - g.itemCents.ebay))}: counted in the totals above, not in any row (the network&apos;s item report did not name them, or has not been read for those days).
          </li>
          <li>
            <b>Sales no product matched:</b> {g.unmatchedOrders} orders, {money(g.unmatchedCents)}. They are in the tables under their own titles.
          </li>
          <li>
            <b>Clicks off product pages</b> (the quick view on lists, the home page, guides): {g.clicksOffProduct ?? "—"} of {g.clicksTotal ?? "—"} buy clicks. Vercel records the page a click was pressed on, not the product, so these have no row.
            {site === "dex" && " DexCompare also sends the product with every buy click (all networks together): that is the “Product clicks” column."}
          </li>
          <li>
            <b>Clicks are not sales.</b> eBay pays on any purchase within 24 hours of the click, not only the product clicked, and a TCGplayer cart can hold other items, so a product&apos;s orders and its clicks need not match. Clicks are never sampled; Vercel shows at most the top 100 pages per query, and visitors who block analytics are not counted.
          </li>
        </ul>
      </section>
    </div>
  );
}

function Status({ clicks, fetchedAt }: { clicks: SiteProductClicks | null; fetchedAt: number | null }) {
  if (!clicks) return <p className="mt-3 text-xs text-amber-300">Clicks not read yet: the earnings refresh reads them once a day, or press Re-read clicks. Sales are shown without clicks meanwhile.</p>;
  const values = Object.entries(clicks.retailers);
  const counted = values.filter(([v]) => retailerNetwork(v));
  return (
    <details className="mt-3 text-xs text-slate-400">
      <summary className="cursor-pointer">
        Clicks read {fetchedAt ? new Date(fetchedAt).toISOString().slice(0, 16).replace("T", " ") : "?"} UTC for {clicks.from} to {clicks.to} · {clicks.status}
        {clicks.detail ? ` · ${clicks.detail}` : ""}
        {clicks.catalogStatus === "error" ? " · catalogue not read" : ` · ${clicks.catalog.length} products in the catalogue`}
      </summary>
      <p className="mt-1">
        Retailer values counted as a network: {counted.length ? counted.map(([v, n]) => `${v} → ${retailerNetwork(v)} (${n})`).join(" · ") : "none"}. Every other value is a store.
      </p>
    </details>
  );
}

function Cells({ c, money }: { c: NetCell; money: (n: number) => string }) {
  return (
    <>
      <td className={`${num} border-l border-ink-800`}>{c.clicks || "·"}</td>
      <td className={num}>{c.orders || "·"}</td>
      <td className={num}>{c.saleCents ? money(c.saleCents) : "·"}</td>
      <td className={`${num} font-bold text-white`}>{c.cents ? money(c.cents) : "·"}</td>
    </>
  );
}

function Table({ rows, first, money, site, showSet }: { rows: ProductRow[]; first: string; money: (n: number) => string; site: ProductSite; showSet: boolean }) {
  if (!rows.length) return <p className="mt-2 text-sm text-slate-500">Nothing in the last 30 days yet.</p>;
  const dex = site === "dex";
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className={th} colSpan={showSet ? 2 : 1} />
            <th className={`${th} border-l border-ink-800 text-center`} colSpan={4}>
              TCGplayer
            </th>
            <th className={`${th} border-l border-ink-800 text-center`} colSpan={4}>
              eBay
            </th>
            <th className={`${th} border-l border-ink-800 text-center`} colSpan={dex ? 3 : 2}>
              Clicks
            </th>
          </tr>
          <tr className="border-b border-ink-700 text-left text-[11px] uppercase tracking-wider text-slate-400">
            <th className={th}>{first}</th>
            {showSet && <th className={th}>Set</th>}
            {["Clicks", "Orders", "Sales", "Earned", "Clicks", "Orders", "Sales", "Earned"].map((h, i) => (
              <th key={i} className={`${th} text-right ${i % 4 === 0 ? "border-l border-ink-800" : ""}`}>
                {h}
              </th>
            ))}
            <th className={`${th} border-l border-ink-800 text-right`}>Amazon</th>
            <th className={`${th} text-right`} title="Every buy click on the product's pages: stores, TCGplayer, eBay and Amazon">
              All
            </th>
            {dex && (
              <th className={`${th} text-right`} title="DexCompare's buy_product events: every network, quick view included">
                Product
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-ink-800 last:border-0">
              <td className="max-w-[300px] truncate px-2 py-1.5 text-slate-200" title={r.name}>
                {r.slug ? (
                  <a href={`${SITE_URL[site]}/us/p/${r.slug}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {r.name}
                  </a>
                ) : (
                  <span className="text-slate-400">{r.name}</span>
                )}
              </td>
              {showSet && (
                <td className="max-w-[160px] truncate px-2 py-1.5 text-xs text-slate-400" title={r.set}>
                  {r.set}
                </td>
              )}
              <Cells c={r.tcgplayer} money={money} />
              <Cells c={r.ebay} money={money} />
              <td className={`${num} border-l border-ink-800`}>{r.amazonClicks || "·"}</td>
              <td className={num}>{r.allClicks || "·"}</td>
              {dex && <td className={num}>{r.productClicks || "·"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
