import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { shippingPolicyUrl } from "@/lib/retailers";
import { STORE_PAGES, storeBySlug, storePageName, STORE_THIN_THRESHOLD } from "@/lib/store-pages";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { breadcrumb } from "@/lib/jsonld";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  return STORE_PAGES.map((s) => ({ slug: s.slug }));
}

// Live inventory for one store. Scoped to a single retailer and capped — never a
// whole-table read (see the egress rules in lib/db.ts).
async function storeStats(key: string) {
  try {
    const [count, agg, cheapest] = await Promise.all([
      prisma.retailerPrice.count({ where: { retailer: key, inStock: true } }),
      prisma.retailerPrice.aggregate({
        where: { retailer: key, inStock: true },
        _min: { priceCents: true },
        _max: { priceCents: true },
      }),
      prisma.retailerPrice.findMany({
        where: { retailer: key, inStock: true },
        orderBy: { priceCents: "asc" },
        take: 24,
        select: {
          priceCents: true,
          isFoil: true,
          condition: true,
          card: { select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true } },
        },
      }),
    ]);
    return { count, min: agg._min.priceCents, max: agg._max.priceCents, cheapest };
  } catch (e) {
    // count:-1 means "couldn't read", NOT "nothing in stock". Returning 0 here
    // would noindex all 84 store pages on any transient DB blip (a real Neon
    // P1001 during a Vercel build is not hypothetical). Only a CONFIRMED low
    // count should trip the thin-page guard.
    console.error(`stores/${key}: inventory query failed:`, e);
    return { count: -1, min: null, max: null, cheapest: [] as never[] };
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const store = storeBySlug(params.slug);
  if (!store) return notFoundMetadata("Store");
  const { count } = await storeStats(store.key);
  const place = COUNTRIES[(store.country ?? "AU") as Country];
  // Market-disambiguated where two keys share a trading name (see
  // lib/store-pages.ts) — otherwise the two pages ship the same <title>.
  const label = storePageName(store, place.label);
  const title = `${label} Riftbound Singles — Live Prices & Stock | RiftCompare`;
  return {
    title: { absolute: title },
    description:
      `Compare live Riftbound singles prices at ${label}${count > 0 ? ` — ${count} cards in stock right now` : ""}. ` +
      `See how this ${place.adjective} store's prices stack up against every other store we track.`,
    alternates: { canonical: `/stores/${store.slug}` },
    // Thin guard: a store with no live inventory (several tracked retailers are
    // deliberately directory-only) would be a page whose only content is
    // "nothing in stock". Real page, still linked, just not submitted for
    // indexing until it has something to show.
    ...(count >= 0 && count < STORE_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description: `Live Riftbound prices and stock at ${label}.`, url: `${SITE_URL}/stores/${store.slug}` },
  };
}

export default async function StorePage({ params }: { params: { slug: string } }) {
  const store = storeBySlug(params.slug);
  if (!store) notFound();

  const country = (store.country ?? "AU") as Country;
  const info = COUNTRIES[country];
  const { count, min, max, cheapest } = await storeStats(store.key);
  const policyUrl = shippingPolicyUrl(store.key);
  const siblings = STORE_PAGES.filter((s) => (s.country ?? "AU") === country && s.slug !== store.slug);

  const trail = [
    { name: "Stores", href: "/stores/tracked" },
    { name: store.name, href: `/stores/${store.slug}` },
  ];

  // Organization, NOT LocalBusiness — we hold no verified address, phone or
  // opening hours for any tracked store (see lib/store-pages.ts). Claiming a
  // LocalBusiness without them would be a hollow entity assertion.
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: store.base,
    areaServed: { "@type": "Country", name: info.label },
  };

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumb(trail), orgLd]) }}
      />

      <div>
        <Breadcrumbs trail={trail} />
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          {storePageName(store, info.label)} — Riftbound singles, live prices &amp; stock
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {count > 0 ? (
            <>
              We track <strong className="text-slate-200">{count.toLocaleString()}</strong> in-stock Riftbound
              singles at {store.name}, a {info.adjective} store, and re-check them daily. Every price below is
              compared against every other store we track, so you can see instantly whether {store.name} is the
              cheapest place to buy a given card.
            </>
          ) : (
            <>
              {store.name} is a {info.adjective} store we track. We don&apos;t have live Riftbound singles pricing
              from them right now — their catalogue may not be listed in a format we can read automatically, or
              they may be out of stock. Prices appear here as soon as we can read them.
            </>
          )}
        </p>
      </div>

      {count > 0 && min != null && max != null && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Riftbound cards in stock" value={count.toLocaleString()} />
          <Stat label="Cheapest single" value={formatMoney(min, info.currency)} accent />
          <Stat label="Most expensive" value={formatMoney(max, info.currency)} />
        </div>
      )}

      {cheapest.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-white">Cheapest Riftbound singles at {store.name}</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Open any card to compare this store&apos;s price against every other store.
              </p>
            </div>
          </div>
          <div className="card-surface overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Card</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Set</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {cheapest.map((r, i) => (
                  <tr key={`${r.card.id}-${i}`} className="transition-colors hover:bg-ink-850">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      <Link href={cardHref(r.card)} className="text-white hover:text-brand-300">
                        {r.card.name}
                      </Link>
                      {r.isFoil && <span className="ml-1.5 text-[10px] uppercase text-gold">Foil</span>}
                      {r.condition && r.condition !== "NM" && (
                        <span className="ml-1.5 text-[10px] uppercase text-slate-500">{r.condition}</span>
                      )}
                    </th>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {r.card.setCode} · {r.card.collectorNumber}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-accent">
                      {formatMoney(r.priceCents, info.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Shipping</h2>
        {/* retailers.ts declares its own shipping figures ESTIMATES, so they are
            labelled as such and never presented as the store's published rate.
            Where a real policy page exists we send people to it instead. */}
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          {store.shippingNote ? `${store.shippingNote}. ` : ""}
          Our comparison uses an estimated {formatMoney(store.shippingFlatCents, info.currency)} postage for a single
          card at {store.name} when ranking delivered cost. That is our own estimate for typical single-card
          postage, not a rate quoted by the store —{" "}
          {policyUrl ? (
            <>
              check{" "}
              {/* rel includes "sponsored": this is a commercial link to a retailer
                  we may earn from. Google's guidance is to mark ANY link placed
                  for a commercial relationship, not only ones carrying a tracking
                  parameter — and an unmarked commercial link on 121 store pages is
                  exactly the shape a reviewer reads as an undisclosed affiliate
                  network. */}
              <a href={policyUrl} target="_blank" rel="sponsored nofollow noopener noreferrer" className="text-brand-400 hover:underline">
                their shipping policy
              </a>{" "}
              for the current published rate.
            </>
          ) : (
            <>confirm the current rate at checkout.</>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={store.base}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            className="btn-primary text-sm"
          >
            Visit {store.name} →
          </a>
          <Link href="/stores/tracked" className="btn-ghost text-sm">All tracked stores</Link>
        </div>
      </section>

      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">Is {store.name} the cheapest?</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          That depends on the card. RiftCompare ranks every store by{" "}
          <strong className="text-slate-200">delivered cost</strong> — the item price plus postage — rather than
          sticker price alone, because the cheapest listing is often not the cheapest order once postage lands.
          Open any card above to see the full comparison, or use the{" "}
          <Link href="/tools/best-basket" className="text-brand-400 hover:underline">best-basket tool</Link> to work
          out the cheapest way to buy a whole want-list, which frequently means splitting it across two stores.
        </p>
      </section>

      {siblings.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-white">Other {info.adjective} stores we track</h2>
          <div className="flex flex-wrap gap-2">
            {siblings.slice(0, 20).map((s) => (
              <Link key={s.slug} href={`/stores/${s.slug}`} className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
                {s.name}
              </Link>
            ))}
            <Link href="/stores/tracked" className="chip border border-ink-700 px-3 py-1.5 text-sm hover:border-brand-500">
              All stores →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`num mt-1 text-lg font-bold ${accent ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
