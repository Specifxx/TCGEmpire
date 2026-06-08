import type { Metadata } from "next";
import Link from "next/link";
import { getSealedGroups } from "@/lib/sealed-import";
import { formatMoney } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { affiliateUrl } from "@/lib/affiliate";
import { OutboundLink } from "@/components/OutboundLink";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Riftbound Sealed Products — Booster Boxes, Packs & Sets (Australia)",
  description:
    "Compare prices on sealed Riftbound products — booster boxes, booster packs, Proving Grounds, bundles and more — across Australian stores to find the cheapest.",
  alternates: { canonical: "/sealed" },
};

export default async function SealedPage({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const country = getCountry();
  const info = COUNTRIES[country];
  const fmt = (cents: number) => formatMoney(cents, info.currency);
  const all = await getSealedGroups(country);
  const q = (typeof searchParams.q === "string" ? searchParams.q : "").trim();
  const ql = q.toLowerCase();
  const groups = ql
    ? all.filter(
        (g) =>
          g.name.toLowerCase().includes(ql) ||
          g.productType.toLowerCase().includes(ql) ||
          (g.setCode ?? "").toLowerCase().includes(ql)
      )
    : all;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Sealed Products</h1>
        <p className="mt-1 text-sm text-slate-400">
          Booster boxes, packs, Proving Grounds, bundles and other sealed Riftbound
          products — priced across {info.adjective} stores so you can find the cheapest.
        </p>
        {q && (
          <p className="mt-2 text-sm text-slate-400">
            Showing matches for <span className="text-brand-400">“{q}”</span>.{" "}
            <Link href="/sealed" className="text-brand-400 hover:underline">Show all</Link>
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">
              {q ? `No sealed products match “${q}”` : "No sealed products yet"}
            </p>
            <p className="mt-1 text-sm">
              {q ? (
                <Link href="/sealed" className="text-brand-400 hover:underline">Show all sealed products</Link>
              ) : (
                "Our feeds refresh regularly — check back soon."
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <div key={g.groupKey} className="card-surface overflow-hidden">
              <div className="flex gap-4 p-4">
                <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-900">
                  {g.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.imageUrl} alt={g.name} className="h-full w-full object-contain" loading="lazy" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip bg-brand-500/15 font-semibold text-brand-300">{g.productType}</span>
                    {g.setCode && <span className="chip bg-ink-800 text-slate-300">{g.setCode}</span>}
                  </div>
                  <h2 className="mt-1 font-bold text-white">{g.name}</h2>
                  <div className="mt-1 text-sm text-slate-500">
                    {g.lowestPriceCents != null ? (
                      <>
                        from <span className="text-lg font-bold text-accent">{fmt(g.lowestPriceCents)}</span>
                        {" · "}{g.storeCount} {g.storeCount === 1 ? "store" : "stores"}
                      </>
                    ) : (
                      "currently unavailable"
                    )}
                  </div>
                </div>
              </div>
              <ul className="divide-y divide-ink-800 border-t border-ink-800">
                {g.listings.slice(0, 6).map((l, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{l.retailerName}</div>
                      <div className="text-xs">
                        {l.inStock ? <span className="text-brand-400">● In stock</span> : <span className="text-slate-500">● Out of stock</span>}
                      </div>
                    </div>
                    <div className={`text-sm font-bold ${i === 0 && l.inStock ? "text-accent" : "text-white"} ${!l.inStock ? "text-slate-500 line-through" : ""}`}>
                      {fmt(l.priceCents)}
                    </div>
                    <OutboundLink href={affiliateUrl(l.url, l.retailer)} retailer={l.retailer} country={country} kind="sealed" className="btn-primary px-3 py-1.5 text-xs">
                      View →
                    </OutboundLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        Sealed prices are collected from public store listings and may change. RiftCompare
        may earn a commission on some outbound links.
      </p>
    </div>
  );
}
