import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { COMMUNITY_RESOURCES, type CommunityResource } from "@/lib/content/community";
import { CommunityLink } from "@/components/CommunityLink";

// /community — a directory of THIRD-PARTY Riftbound sites: news, wikis, deck
// builders, tier lists, video. See lib/content/community.ts's header for why
// this is not /creators and why every entry is unpaid/unaffiliated. Static
// (no DB read, hand-curated array), same ISR shape as /creators and /about.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Community Links & Resources",
  description:
    "Where else to go for Riftbound: official news, community wikis and card databases, deck builders, tier lists and video — a directory of the sites and tools the community actually uses.",
  keywords: [
    "Riftbound community",
    "Riftbound wiki",
    "Riftbound deck builder",
    "Riftbound tier list",
    "Riftbound news",
  ],
  alternates: pageAlternates("/community"),
  openGraph: {
    title: "Riftbound Community Links & Resources",
    description: "News, wikis, deck builders, tier lists and video from the wider Riftbound community.",
    url: `${SITE_URL}/community`,
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Community", item: `${SITE_URL}/community` },
  ],
};
const pageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `Riftbound Community Links & Resources — ${SITE_NAME}`,
  url: `${SITE_URL}/community`,
  description: "A directory of Riftbound community sites: news, wikis, deck builders, tier lists and video.",
  publisher: { "@id": `${SITE_URL}/#org` },
};

// Fixed display order — independent of array insertion order in the data file,
// so appending a new resource under an existing category can never reshuffle
// the page's section order.
const CATEGORY_ORDER: CommunityResource["category"][] = [
  "News, Wikis & Databases",
  "Deck Builders & Simulators",
  "Meta & Tier Lists",
  "Video",
];

export default function CommunityPage() {
  const byCategory = new Map<CommunityResource["category"], CommunityResource[]>();
  for (const r of COMMUNITY_RESOURCES) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, pageLd]) }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Community</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight text-white">Riftbound Community Links &amp; Resources</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        {SITE_NAME} is one part of a much bigger Riftbound community. Here&rsquo;s where else to go — official
        news, community wikis and card databases, deck builders, tier lists and video. Some of these are direct
        alternatives to tools we build ourselves; they&rsquo;re listed anyway, because a resource hub that only
        links to things that don&rsquo;t compete with us would be a worse hub.
      </p>

      <div className="mt-6 space-y-8 border-t border-ink-800 pt-6">
        {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
          <section key={category} className="space-y-3">
            <h2 className="text-lg font-bold text-white">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {byCategory.get(category)!.map((r) => (
                <CommunityLink key={r.url} resource={r} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 border-t border-ink-800 pt-5 text-xs leading-relaxed text-slate-500">
        These are independent, third-party sites — {SITE_NAME} has no commercial relationship with anything
        listed here and doesn&rsquo;t control or vouch for their content. Know a site that belongs on this list?{" "}
        <Link href="/feedback" className="text-brand-400 hover:underline">Let us know</Link>.
      </p>
    </article>
  );
}
