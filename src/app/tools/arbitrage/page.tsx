import type { Metadata } from "next";
import Link from "next/link";
import { getArbitrage, getEbayCheapest, getArbSources, EBAY_FEE, type ArbSort, type DealSort } from "@/lib/arbitrage";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "@/components/OutboundLink";
import { ArbitrageFilters } from "@/components/ArbitrageFilters";
import { CardQuickLink } from "@/components/CardQuickLink";
import type { CardTileData } from "@/components/CardTile";
import { SITE_URL } from "@/lib/site";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled } from "@/lib/premium";
import { PremiumCta } from "@/components/PremiumCta";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Riftbound Arbitrage & eBay Deals | RiftCompare" },
  description:
    "A RiftCompare Premium tool: live Riftbound flipping arbitrage (buy cheap from a store, sell on eBay) plus the cards eBay is cheapest to buy. Sortable, paginated, updated daily, with direct buy/sell links.",
  alternates: { canonical: "/tools/arbitrage" },
  openGraph: { title: "Riftbound Arbitrage & eBay Deals", url: `${SITE_URL}/tools/arbitrage` },
};

const PAGE_SIZE = 25;
const FLIP_SORTS: { key: ArbSort; label: string }[] = [
  { key: "profit", label: "Most profit" },
  { key: "margin", label: "Best margin" },
];
const DEAL_SORTS: { key: DealSort; label: string }[] = [
  { key: "saving", label: "Biggest saving" },
  { key: "pct", label: "Best % off" },
];

export default async function ArbitragePage({
  searchParams,
}: {
  searchParams: { sort?: string; page?: string; buy?: string; view?: string };
}) {
  const country = getCountry();
  const info = COUNTRIES[country];

  // Arbitrage is a RiftCompare Premium feature. Admins always have access.
  const user = await getCurrentUser();
  const unlocked = isPremium(user) || !!user?.isAdmin;
  if (!unlocked) {
    return <ArbitrageLocked signedIn={!!user} checkoutLive={premiumCheckoutEnabled()} />;
  }

  const sources = getArbSources(country);
  const storeKeys = sources.filter((s) => !s.isEbay).map((s) => s.key);
  const ebay = sources.find((s) => s.isEbay);
  const view: "flip" | "deals" = searchParams.view === "deals" ? "deals" : "flip";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Arbitrage</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">💱 Arbitrage &amp; eBay Deals</h1>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1" role="tablist" aria-label="Views">
        <Link
          href="/tools/arbitrage"
          aria-current={view === "flip" ? "page" : undefined}
          className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-bold ${view === "flip" ? "bg-brand-500/20 text-brand-200" : "text-slate-400 hover:text-white"}`}
        >
          💱 Flip to eBay
        </Link>
        <Link
          href="/tools/arbitrage?view=deals"
          aria-current={view === "deals" ? "page" : undefined}
          className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-bold ${view === "deals" ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-white"}`}
        >
          🛒 Cheapest on eBay
        </Link>
      </div>

      {!ebay ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          These views aren&apos;t available in {info.place} yet — they&apos;re eBay-based, and eBay doesn&apos;t cover this market.
        </div>
      ) : view === "deals" ? (
        await DealsView({ country, info, sort: searchParams.sort === "pct" ? "pct" : "saving", page })
      ) : (
        await FlipView({ country, info, sort: searchParams.sort === "margin" ? "margin" : "profit", page, buy: searchParams.buy, sources, ebayKey: ebay.key, storeKeys })
      )}
    </div>
  );
}

// ── Locked state (non-Premium visitors) ─────────────────────────────────────────
// Keeps the page indexable as a Premium upsell rather than redirecting away — the
// teaser sells the feature, the CTA routes to checkout/sign-in.
function ArbitrageLocked({ signedIn, checkoutLive }: { signedIn: boolean; checkoutLive: boolean }) {
  const perks = [
    ["💱 Flip to eBay", "Buy cheap from a store, sell on eBay — ranked by profit and margin, fees included."],
    ["🛒 Cheapest on eBay", "The cards eBay is cheapest to buy right now, by biggest saving or best % off."],
    ["🔎 Sortable & paginated", "Filter the buy side, sort either view, and page through every opportunity."],
    ["🔗 Direct buy/sell links", "Jump straight to the listing on each side. Refreshed with the daily price import."],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Arbitrage</span>
        </nav>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">💱 Arbitrage &amp; eBay Deals</h1>
          <span className="chip bg-gold/15 text-xs font-bold text-gold">★ PREMIUM</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          Live flipping arbitrage and the cheapest eBay buys for Riftbound singles — a RiftCompare Premium tool.
        </p>
      </div>

      <div className="card-surface overflow-hidden bg-gradient-to-br from-gold/10 via-ink-850 to-brand-600/10 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {perks.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
              <div className="text-sm font-bold text-white">{title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <PremiumCta checkoutLive={checkoutLive} signedIn={signedIn} />
        </div>

        {signedIn && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Already Premium?{" "}
            <Link href="/login?next=/tools/arbitrage" className="text-brand-400 hover:underline">Sign in again</Link> to refresh your access.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Flip view (buy store → sell eBay) ────────────────────────────────────────────
async function FlipView({
  country,
  info,
  sort,
  page,
  buy: buyParam,
  sources,
  ebayKey,
  storeKeys,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: ArbSort;
  page: number;
  buy?: string;
  sources: ReturnType<typeof getArbSources>;
  ebayKey: string;
  storeKeys: string[];
}) {
  const buy = buyParam ? buyParam.split(",").map((s) => s.trim()).filter(Boolean) : storeKeys;
  const sell = [ebayKey];
  const data = await getArbitrage(country, { buy, sort, sell, page, pageSize: PAGE_SIZE });
  const href = (p: number) => `/tools/arbitrage?buy=${buy.join(",")}&sort=${sort}&page=${p}`;
  const sortHref = (s: ArbSort) => `/tools/arbitrage?buy=${buy.join(",")}&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Buy a card cheap from a {info.adjective} store and resell it on <strong className="text-slate-200">eBay</strong> for a
        profit. Net is after an estimated {Math.round(EBAY_FEE * 100)}% eBay fee; postage and your time aren&apos;t included.
      </p>
      <p className="mb-4 text-xs text-slate-500">
        eBay is the only marketplace we can price a resale on right now. Know another store that buys cards?{" "}
        <Link href="/contact" className="text-brand-400 hover:underline">Email us</Link> and we&apos;ll add it as a sell option.
      </p>

      <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
        <ArbitrageFilters sources={sources} buy={buy} sell={sell} sort={sort} />
        <SortTabs sorts={FLIP_SORTS} active={sort} hrefFor={sortHref} />
      </div>

      {data.items.length === 0 ? (
        <Empty>No profitable arbitrage for these sources right now in {info.place}. Try widening the buy side.</Empty>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Card</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Buy</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Sell</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Net profit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {data.items.map((it) => (
                  <tr key={it.card.id} className="hover:bg-ink-900/50">
                    <CardCell card={it.card} />
                    <td className="px-2 py-2 text-right">
                      <OutboundLink href={it.buyUrl} retailer={it.buyStore} country={country} className="font-semibold text-white hover:text-brand-400">
                        {formatMoney(it.buyCents, info.currency)}
                      </OutboundLink>
                      <div className="truncate text-[10px] text-slate-500" title={it.buyStoreName}>{it.buyStoreName}</div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <OutboundLink href={it.sellUrl} retailer="ebay_arb" country={country} className="font-semibold text-slate-200 hover:text-brand-400">
                        {formatMoney(it.sellCents, info.currency)}
                      </OutboundLink>
                      <div className="text-[10px] text-sky-400">{it.sellName}</div>
                    </td>
                    <td className="px-2 py-2 text-right font-bold text-brand-400">+{formatMoney(it.netCents, info.currency)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-brand-300">{it.marginPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="opportunities" />
        </>
      )}
    </>
  );
}

// ── Deals view (cards eBay is cheapest to buy) ───────────────────────────────────
async function DealsView({
  country,
  info,
  sort,
  page,
}: {
  country: ReturnType<typeof getCountry>;
  info: (typeof COUNTRIES)[keyof typeof COUNTRIES];
  sort: DealSort;
  page: number;
}) {
  const data = await getEbayCheapest(country, sort, page, PAGE_SIZE);
  const href = (p: number) => `/tools/arbitrage?view=deals&sort=${sort}&page=${p}`;
  const sortHref = (s: DealSort) => `/tools/arbitrage?view=deals&sort=${s}&page=1`;

  return (
    <>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        Cards where <strong className="text-slate-200">eBay is the cheapest place to buy</strong> — its price beats every{" "}
        {info.adjective} store we track. Grab the deal on eBay, or open the card to compare every option.
      </p>

      <div className="card-surface mb-4 flex flex-wrap items-center justify-end gap-4 p-4">
        <SortTabs sorts={DEAL_SORTS} active={sort} hrefFor={sortHref} />
      </div>

      {data.items.length === 0 ? (
        <Empty>No cards are cheaper on eBay than in stores right now in {info.place}.</Empty>
      ) : (
        <>
          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Card</th>
                  <th className="px-2 py-2.5 text-right font-semibold">eBay</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Cheapest store</th>
                  <th className="px-4 py-2.5 text-right font-semibold">You save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {data.items.map((it) => (
                  <tr key={it.card.id} className="hover:bg-ink-900/50">
                    <CardCell card={it.card} />
                    <td className="px-2 py-2 text-right">
                      <OutboundLink href={it.ebayUrl} retailer="ebay_deal" country={country} className="font-semibold text-sky-300 hover:text-sky-200">
                        {formatMoney(it.ebayCents, info.currency)}
                      </OutboundLink>
                      <div className="text-[10px] text-sky-400">on eBay →</div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="text-slate-300">{formatMoney(it.storeCents, info.currency)}</div>
                      <div className="truncate text-[10px] text-slate-500" title={it.storeName}>{it.storeName}</div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-bold text-brand-400">{formatMoney(it.savingCents, info.currency)}</span>
                      <span className="ml-1 text-[11px] font-semibold text-brand-300">({it.savingPct}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} page={data.page} pageCount={data.pageCount} hrefFor={href} unit="deals" />
          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            eBay / store are the cheapest current in-stock prices. eBay postage isn&apos;t included; thin or one-off listings
            can mislead — open the card to see every option before buying.
          </p>
        </>
      )}
    </>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────────
function CardCell({ card }: { card: CardTileData }) {
  return (
    <td className="px-4 py-2">
      <CardQuickLink card={card} className="flex items-center gap-2.5">
        {card.imageThumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageThumbUrl} alt="" width={28} height={39} loading="lazy" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold text-white">{card.name}</span>
          <span className="block text-[11px] text-slate-500">{card.setCode} · {card.collectorNumber}</span>
        </span>
      </CardQuickLink>
    </td>
  );
}

function SortTabs<T extends string>({ sorts, active, hrefFor }: { sorts: { key: T; label: string }[]; active: T; hrefFor: (s: T) => string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sort</div>
      <div className="mt-0.5 flex gap-1">
        {sorts.map((s) => (
          <Link
            key={s.key}
            href={hrefFor(s.key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${active === s.key ? "bg-brand-500/20 text-brand-200" : "bg-ink-900 text-slate-400 hover:text-white"}`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">{children}</div>;
}

function Pager({ total, page, pageCount, hrefFor, unit }: { total: number; page: number; pageCount: number; hrefFor: (p: number) => string; unit: string }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-xs text-slate-500">{total} {unit} · page {page} of {pageCount}</span>
      <div className="flex gap-2">
        {page > 1 && <Link href={hrefFor(page - 1)} className="btn-ghost text-sm">← Prev</Link>}
        {page < pageCount && <Link href={hrefFor(page + 1)} className="btn-ghost text-sm">Next →</Link>}
      </div>
    </div>
  );
}
