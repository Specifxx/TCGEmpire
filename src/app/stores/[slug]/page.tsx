import type { Metadata } from "next";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { shippingPolicyUrl } from "@/lib/retailers";
import { STORE_PAGES, storeBySlug, storePageName, STORE_THIN_THRESHOLD } from "@/lib/store-pages";
import { formatMeasuredDate, shippingSummary, type StoreShippingSummary } from "@/lib/shipping";
import { storeBadgeHtml } from "@/lib/store-badge";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";

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
  const { count, cheapest } = await storeStats(store.key);
  const place = COUNTRIES[(store.country ?? "AU") as Country];
  // Market-disambiguated where two keys share a trading name (see
  // lib/store-pages.ts) — otherwise the two pages ship the same <title>.
  const label = storePageName(store, place.label);
  // Stepped down like card/[id]/page.tsx and sets/[set]/page.tsx: checked WITH
  // " | RiftCompare" appended. The previous single fixed string had no length
  // guard at all — computed over all 132 store pages, 97 rendered over 65 chars
  // and 39 over 70. The two page counts are this repo's own measurement and
  // stand; the "part of Bing's 397 'Title too long' warnings" that used to
  // follow them does NOT — that figure is unsourced (nothing in DECISIONS.md or
  // docs/ records a Bing Webmaster Tools reading, and there was no Bing
  // monitoring here until bing-coverage.yml). The 60-char budget below is
  // justified by the repo's own SEO gate regardless of what Bing reports, so
  // nothing about this code depends on the retracted number. `label` itself
  // can carry a market-disambiguation suffix (e.g. "Danireon Cards & Games
  // (United States)" — see storePageName's own doc comment for why that exists
  // and can't be dropped), so even the shortest candidate here isn't guaranteed
  // to clear 60 for every store; the bare label is the honest final fallback.
  const titleCandidates = [
    `${label} Riftbound Singles — Live Prices & Stock`,
    `${label} Riftbound Singles — Live Prices`,
    `${label} — Riftbound Singles`,
    `${label} — Riftbound Store`,
    label,
  ];
  const title =
    titleCandidates.find((t) => `${t} | RiftCompare`.length <= 60) ?? titleCandidates[titleCandidates.length - 1];
  return {
    title: { absolute: `${title} | RiftCompare` },
    // NAMES A CARD THIS STORE ACTUALLY HAS. The previous sentence varied only by
    // the store's name and a stock count, so 43 of the 79 store pages read as one
    // description to a near-duplicate detector — digits are discounted, and
    // "Australian store" is shared by every AU store (GROWTH-AUDIT.md § 4).
    // storeStats() already fetched the 24 cheapest in-stock listings for the page
    // body, so the card name costs no extra query, and it is the most varying
    // real fact available: it is this store's own cheapest live listing.
    description:
      `Compare live Riftbound singles prices at ${label}${count > 0 ? ` — ${count} cards in stock` : ""}` +
      `${cheapest[0] ? `, from ${cheapest[0].card.name} at ${formatMoney(cheapest[0].priceCents, place.currency)}` : ""}. ` +
      `See how this ${place.adjective} store compares to every other store we track.`,
    alternates: pageAlternates(`/stores/${store.slug}`),
    // Thin guard: a store with no live inventory (several tracked retailers are
    // deliberately directory-only) would be a page whose only content is
    // "nothing in stock". Real page, still linked, just not submitted for
    // indexing until it has something to show.
    ...(count >= 0 && count < STORE_THIN_THRESHOLD ? { robots: { index: false, follow: true } } : {}),
    openGraph: pageOpenGraph({ title: `${title} | RiftCompare`, description: `Live Riftbound prices and stock at ${label}.`, url: `/stores/${store.slug}` }),
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
      {/* Breadcrumbs below already emits its own matching BreadcrumbList — only
          the store's own Organization schema belongs in this block. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />

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
        {/* MEASURED from the store's own checkout (lib/shipping.ts), not the
            hand-typed guesses this section showed until 2026-09-25 — an
            Adelaide customer was shown $2 for a store that charges $20. A
            store not measured yet says so and its estimate is labelled one. */}
        <StoreShipping summary={shippingSummary(store.key)} storeName={store.name} policyUrl={policyUrl} />
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

      {/* The highest-intent B2B placement on the site: someone reading a page
          ABOUT a shop is far likelier to run one than the average visitor —
          store owners search their own store name. Quiet by design (one line,
          no card, no button) because everyone else here is a shopper. */}
      <p className="text-center text-xs text-slate-500">
        Work at {store.name}?{" "}
        <Link href="/stores" className="text-brand-400 hover:underline">
          See your live pricing position
        </Link>{" "}
        — free repricing report for tracked stores.
      </p>

      {/* "Add this badge" (2026-09-24): the store-owner reader above, given
          something to take away. Plain HTML + inline SVG from lib/store-badge.ts
          — no iframe, so the link sits on the store's own page — with this
          store's slug filled in. Preview and snippet are the same string. */}
      <section aria-labelledby="store-badge-h" className="card-surface p-5">
        <h2 id="store-badge-h" className="text-base font-bold text-white">Add this badge to {store.name}&apos;s site</h2>
        <p className="mt-1 text-sm text-slate-400">
          It links your customers to this page. Plain HTML, logo drawn inline — no script and nothing to host.
        </p>
        <div className="mt-3" dangerouslySetInnerHTML={{ __html: storeBadgeHtml(store) }} />
        <pre className="mt-3 overflow-x-auto rounded-lg border border-ink-800 bg-ink-950 p-3 text-xs leading-relaxed text-slate-300">
          <code>{storeBadgeHtml(store)}</code>
        </pre>
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

// The Shipping section's body: the store's measured rates (its own names), the
// cheap letter's measured limits, the free-postage threshold if one was found,
// and region differences — or a plainly labelled estimate for a store the probe
// could not measure.
function StoreShipping({ summary: s, storeName, policyUrl }: { summary: StoreShippingSummary; storeName: string; policyUrl: string | null }) {
  const m = (c: number) => formatMoney(c, s.currency);
  const range = (lo: number, hi: number) => (lo === hi ? m(hi) : `${m(lo)}–${m(hi)}`);
  const policy = policyUrl ? (
    <>
      {" "}
      Their{" "}
      {/* rel includes "sponsored": a commercial link to a retailer we may earn
          from (Google's guidance covers any link placed for a commercial
          relationship, not only tracked ones). */}
      <a href={policyUrl} target="_blank" rel="sponsored nofollow noopener noreferrer" className="text-brand-400 hover:underline">
        shipping policy
      </a>{" "}
      has the full terms.
    </>
  ) : null;

  if (s.basis === "estimate") {
    return (
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
        We haven&apos;t measured {storeName}&apos;s postage yet{s.note ? ` — ${s.note.replace(/^Not measured: /, "")}` : ""}.
        {s.estimateCents != null && (
          <>
            {" "}
            Best Basket uses an estimated {m(s.estimateCents)} per order for it, marked &ldquo;est.&rdquo; — the dearer of our guess
            and the dearest one-card rate of the stores we checked in this market, because our guesses ran low almost everywhere.
            It&apos;s our guess, not a rate the store quoted.
          </>
        )}{" "}
        Confirm the real rate at checkout.{policy}
      </p>
    );
  }
  if (s.basis === "no-post") {
    return (
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
        {storeName} doesn&apos;t post orders to the addresses we checked{s.note ? `: ${s.note}` : ""}
        {s.measuredAt ? ` (checked ${formatMeasuredDate(s.measuredAt)})` : ""}. Best Basket leaves it out.{policy}
      </p>
    );
  }
  return (
    <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-slate-400">
      <p>
        Measured from {storeName}&apos;s own checkout on {formatMeasuredDate(s.measuredAt)}, for singles orders of different sizes
        and values:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {s.std && (
          <li>
            <strong className="text-slate-200">{s.std.label}</strong>
            {s.std.tracked ? " (tracked)" : " (tracking not stated)"}: {s.std.maxCents === 0 ? "free" : m(s.std.maxCents)} for one card
            {s.regions ? ` where it costs most — ${range(s.std.minCents, s.std.maxCents)} depending on where it's going` : ""}.
          </li>
        )}
        {s.letter && (
          <li>
            Untracked: <strong className="text-slate-200">{s.letter.label}</strong> {range(s.letter.minCents, s.letter.maxCents)} —
            offered on orders we tried {s.letter.fromValueCents != null ? `from ${m(s.letter.fromValueCents)} ` : ""}up to{" "}
            {s.letter.maxItems} card{s.letter.maxItems === 1 ? "" : "s"} and {m(s.letter.maxValueCents)}
            {s.letter.fromValueCents != null ? " (a smaller order got only the parcel rate)" : ""}. Best Basket only counts it for
            orders within that.
          </li>
        )}
        {s.free && (
          <li>
            {s.free.fromCents != null ? (
              <>
                Free postage from {m(s.free.fromCents)}
                {s.free.note ? ` (${s.free.note})` : s.free.paidAtCents != null ? ` (an order of ${m(s.free.paidAtCents)} still paid)` : ""}.
              </>
            ) : s.free.letterFromCents != null ? null : (
              <>No free-postage threshold on any order we tried, up to {m(s.free.upToCents)}.</>
            )}
            {s.free.letterFromCents != null && (
              <>
                {s.free.fromCents != null ? " " : ""}The untracked letter goes free from {m(s.free.letterFromCents)}
                {s.free.fromCents == null ? `; the parcel rate never did on any order we tried, up to ${m(s.free.upToCents)}` : ""}.
              </>
            )}
          </li>
        )}
        {s.minOrderCents != null && <li>No postage offered on orders under {m(s.minOrderCents)}.</li>}
        {s.regions && (
          <li>
            By region, one card:{" "}
            {s.regions
              .map((r) => `${r.label} ${r.cents == null ? "—" : m(r.cents)}${r.label2 && r.label2 !== s.std?.label ? ` (${r.label2})` : ""}`)
              .join(" · ")}
            .
          </li>
        )}
        {s.notServed && s.notServed.length > 0 && <li>Doesn&apos;t post to: {s.notServed.join(", ")}.</li>}
        {s.shipsFrom && (
          <li>
            Ships from {s.shipsFrom}: import duties or a carrier&apos;s brokerage fee may be charged on delivery, on top of the
            postage — unless the rate says duties are included.
          </li>
        )}
      </ul>
      <p className="text-xs text-slate-500">
        Best Basket prices {storeName} with these rates for your order&apos;s size and region. Stores change their rates, so the
        store&apos;s own checkout is final.{policy}
      </p>
    </div>
  );
}
