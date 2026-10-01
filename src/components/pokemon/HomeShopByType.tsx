import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { sourceWord } from "@/lib/pokemon/format";
import type { ShopType } from "@/lib/pokemon/home";

// "Shop by type": one card per product type, with the cheapest open listing
// of a released product of that type as its "from" figure. Cards for kinds
// with a hub go to the hub; the rest go to the filtered grid.

export function HomeShopByType({ types, currency, place }: { types: ShopType[]; currency: string; place: string }) {
  const shown = types.filter((t) => t.count > 0);
  if (!shown.length) return null;
  return (
    <section className="mb-8" aria-labelledby="home-shop">
      <h2 id="home-shop" className="scroll-mt-header mb-3 text-lg font-extrabold text-white">
        Shop by type
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <Link
            key={t.kind}
            href={t.href}
            className="card-surface group flex min-h-11 flex-col gap-1 p-4 transition-colors hover:border-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <span className="font-bold text-white group-hover:text-brand-300">{t.label}</span>
            {t.from?.lowCents != null ? (
              <span className="text-sm text-slate-300">
                from <span className="num font-bold text-accent">{formatMoney(t.from.lowCents, currency)}</span>{" "}
                <span className="text-xs text-slate-400">{sourceWord(t.from.lowSource)}</span>
              </span>
            ) : (
              <span className="text-sm text-slate-400">No tracked listing in {place}</span>
            )}
            <span className="text-xs text-slate-500">
              {t.count.toLocaleString("en-US")} {t.count === 1 ? "product" : "products"} →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
