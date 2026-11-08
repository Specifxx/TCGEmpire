import type { Metadata } from "next";
import Link from "next/link";
import { FAMILY_SITES, NETWORK_PAGE } from "@/lib/family-network";
import { SITE_NAME } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";

// The one page that links the owner's other sites (2026-11-08, DECISIONS.md "One Our sites page instead of
// footer cross-links"). The footer used to name the other card sites on every page: thousands of site-wide
// links between our own sites, the pattern Google's link-spam policy warns about, with no authority in it.
// Now every footer links here once, and this page links each site once, by its plain name. No database read.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Our other sites",
  description: `${SITE_NAME} is one of the Compare Empire price comparison sites. The others compare card games, hobby and tech prices the same way.`,
  alternates: pageAlternates("/our-sites"),
};

export default function OurSitesPage() {
  const sites = FAMILY_SITES.filter((s) => s.id !== "rift");
  return (
    <article className="mx-auto max-w-3xl">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Our other sites</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight text-white">Our other sites</h1>
      <p className="mt-2 text-slate-400">
        {SITE_NAME} is one of the Compare Empire sites: independent price comparison, the same rules on every site, no paid ranking.
      </p>
      <ul className="mt-6 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {sites.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
            <a href={s.url} rel="noopener" className="tap-link font-semibold text-brand-400 hover:underline">
              {s.name}
            </a>
            <span className="text-sm text-slate-400">{s.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-slate-400">
        <a href={NETWORK_PAGE} rel="noopener" className="tap-link hover:underline">Every Compare Empire site →</a>
      </p>
    </article>
  );
}
