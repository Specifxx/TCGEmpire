import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSealedProductBySlug } from "@/lib/sealed-import";
import { DEFAULT_COUNTRY, type Country } from "@/lib/country";
import { isPreorderSetCode, SETS } from "@/lib/constants";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SealedProductView } from "@/components/SealedProductView";

// A sealed product's own page (2026-11-03, owner: Amazon "up there with eBay and TCGplayer" on RiftCompare too, which
// had no sealed page to put it on; DECISIONS.md "Sealed products get their own pages"). The /sealed tiles and the quick
// view link here. ONE CACHED COPY PER PRODUCT, KEPT BY VERCEL'S CDN, the same way as /card/[id]: rendered per request
// (force-dynamic), kept a day plus a day of stale-while-revalidate (next.config.js `/sealed/:slug`), never ISR or
// generateStaticParams, and nothing in its server tree reads a cookie, a header or the session. Every market's group
// goes to the client island, which shows the visitor's. The loader is the /sealed page's own cached groups
// (getSealedProductBySlug), so the page adds no database read.
export const dynamic = "force-dynamic";

const pick = (byMarket: Awaited<ReturnType<typeof getSealedProductBySlug>>) =>
  byMarket[DEFAULT_COUNTRY] ?? Object.values(byMarket).find(Boolean) ?? null;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const byMarket = await getSealedProductBySlug(params.slug);
  const g = pick(byMarket);
  if (!g) return { title: "Sealed product not found", robots: { index: false, follow: true } };
  const preorder = isPreorderSetCode(g.setCode);
  const markets = Object.keys(byMarket).length;
  return {
    title: `${g.name} Price${preorder ? " (Pre-order)" : ""} — Compare Riftbound Stores`,
    description: `Compare ${g.name} prices across the Riftbound stores we track${markets > 1 ? ` in ${markets} markets` : ""}, plus eBay and TCGplayer. Cheapest in-stock price first, with an MSRP check. Updated twice a day.`,
    alternates: pageAlternates(`/sealed/${params.slug}`),
  };
}

export default async function SealedProductPage({ params }: { params: { slug: string } }) {
  const byMarket = await getSealedProductBySlug(params.slug);
  const g = pick(byMarket);
  if (!g) notFound();
  const set = g.setCode ? SETS.find((s) => s.code === g.setCode) ?? null : null;
  const preorder = isPreorderSetCode(g.setCode);
  const listedIn = (Object.keys(byMarket) as Country[]).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <Breadcrumbs
        trail={[
          { name: "Sealed", href: "/sealed" },
          { name: g.name, href: `/sealed/${params.slug}` },
        ]}
      />
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip bg-brand-500/15 font-semibold text-brand-300">{g.productType}</span>
          {g.setCode && <span className="chip bg-ink-800 text-slate-300">{set?.name ?? g.setCode}</span>}
          {preorder && <span className="chip bg-amber-500/15 font-semibold text-amber-300">Pre-order</span>}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight text-white sm:text-3xl">{g.name} prices</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Every store we track that lists the {g.name}, cheapest in-stock first, with eBay and TCGplayer
          {listedIn > 1 ? `, in your market (we track it in ${listedIn} markets).` : "."}
        </p>
      </header>

      <SealedProductView byMarket={byMarket} />

      <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="More sealed">
        {g.setCode && (
          <Link href={`/sealed?set=${encodeURIComponent(g.setCode)}`} prefetch={false} className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
            All {set?.name ?? g.setCode} sealed →
          </Link>
        )}
        <Link href="/sealed" prefetch={false} className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
          All Riftbound sealed prices →
        </Link>
        {set && (
          <Link href={`/sets/${set.slug}`} prefetch={false} className="chip border border-ink-700 hover:border-brand-500 hover:bg-ink-800">
            {set.name} card prices →
          </Link>
        )}
      </nav>
    </div>
  );
}
