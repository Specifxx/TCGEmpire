import Link from "next/link";
import { CopyPostButton } from "@/components/CopyPostButton";
import { COUNTRIES, type Country } from "@/lib/country";
import { sealedPath } from "@/lib/sealed-slug";
import { cheapestBadgeHtml, monthLabel, type StoreWinSummary } from "@/lib/store-wins";

// The store page's "cheapest price" record for last month and the badge that says so (lib/store-wins.ts). The
// number, the products and the days are all here, so a shopper who follows the badge can check the claim.
export function StoreCheapestBadge({
  store,
  claim,
  month,
  days,
}: {
  store: { slug: string; name: string };
  claim: StoreWinSummary;
  month: string;
  days: number;
}) {
  const label = monthLabel(month);
  const market = COUNTRIES[claim.country as Country]?.label ?? claim.country;
  const dark = cheapestBadgeHtml({ ...store, month, products: claim.products, theme: "dark" });
  const light = cheapestBadgeHtml({ ...store, month, products: claim.products, theme: "light" });
  const shown = claim.top.slice(0, 8);
  return (
    <section aria-labelledby="store-cheapest-h" className="card-surface overflow-hidden p-0">
      <div className="border-b border-ink-800 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-400">Cheapest price · {label}</p>
        <h2 id="store-cheapest-h" className="mt-1 text-lg font-bold text-white sm:text-xl">
          {store.name} had the lowest price on {claim.products} Riftbound products in {label}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Of the {claim.contested} products it had in stock while another {market} store did too, it was cheapest on{" "}
          {claim.products}, on at least one day. That ranks it {claim.rankInMarket === 1 ? "first" : `#${claim.rankInMarket}`} of the{" "}
          {claim.storesInMarket} {market} stores with a cheapest price that month.{" "}
          <Link href="/stores/cheapest" className="text-brand-400 hover:underline">
            How we count
          </Link>
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-200">Where it was cheapest</h3>
          <ul className="mt-2 divide-y divide-ink-800 text-sm">
            {shown.map((p) => (
              <li key={p.groupKey} className="flex items-baseline justify-between gap-3 py-2">
                <Link href={sealedPath(p.groupKey)} className="min-w-0 truncate text-slate-200 hover:text-brand-400 hover:underline">
                  {p.title}
                </Link>
                <span className="num shrink-0 text-xs text-slate-500">
                  {p.days} of {days} {days === 1 ? "day" : "days"}
                </span>
              </li>
            ))}
          </ul>
          {claim.top.length > shown.length && (
            <p className="mt-2 text-xs text-slate-500">and {claim.top.length - shown.length} more.</p>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-200">Show it on {store.name}&apos;s site</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Paste the code anywhere on your site. It links here, where the products behind the number are listed. Plain HTML
            with the mark drawn inline: no script, no image to host, nothing that tracks your visitors.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <figure className="m-0">
              <div className="flex min-h-[84px] items-center justify-center overflow-x-auto rounded-lg border border-ink-800 bg-[#0b1820] p-3">
                <div dangerouslySetInnerHTML={{ __html: dark }} />
              </div>
              <figcaption className="mt-1 text-[11px] text-slate-500">For a dark site</figcaption>
            </figure>
            <figure className="m-0">
              <div className="flex min-h-[84px] items-center justify-center overflow-x-auto rounded-lg border border-ink-800 bg-[#f4f7f5] p-3">
                <div dangerouslySetInnerHTML={{ __html: light }} />
              </div>
              <figcaption className="mt-1 text-[11px] text-slate-500">For a light site</figcaption>
            </figure>
          </div>
          <details className="mt-3 rounded-lg border border-ink-800 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-300">Get the code</summary>
            <div className="mt-3 space-y-3">
              <CopyPostButton text={dark} label="Copy the dark badge" copiedHint="Paste it into your site's HTML." />
              <CopyPostButton text={light} label="Copy the light badge" copiedHint="Paste it into your site's HTML." />
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
