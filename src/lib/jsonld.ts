// Shared structured-data builders.
//
// WHY: BreadcrumbList was hand-written inline on ~24 routes and absent from ~16
// others, so the pages that had it drifted (different key order, some missing the
// Home entry, some pointing at a path that isn't the page's own canonical) and the
// pages that lacked it gave Google no hierarchy signal at all — one of the reasons
// a page like /blog/riftbound-vendetta-card-gallery renders its SERP breadcrumb as
// "riftcompare.com › Blog", i.e. reading like a news post rather than a tool.
//
// Every builder here returns a plain object to be JSON.stringify'd into a
// <script type="application/ld+json">. They take RELATIVE hrefs and absolutise
// against SITE_URL, because a breadcrumb `item` must be a full URL and passing a
// relative one is silently invalid.
import { SITE_URL } from "./site";

export interface Crumb {
  name: string;
  /** Site-relative path, e.g. "/tools/box-ev". Omit on the final (current) crumb
   *  only if the page genuinely has no canonical of its own — otherwise always
   *  pass it, since a self-referencing final item is valid and expected. */
  href: string;
}

const absolute = (href: string): string =>
  href.startsWith("http") ? href : `${SITE_URL}${href === "/" ? "" : href}`;

/**
 * BreadcrumbList for a trail. The Home crumb is prepended automatically — pass
 * only the path BELOW home, e.g. breadcrumb([{ name: "Tools", href: "/tools" }]).
 * Passing an empty trail yields just Home, which is what the homepage wants.
 */
export function breadcrumb(trail: Crumb[]) {
  const items: Crumb[] = [{ name: "Home", href: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absolute(c.href),
    })),
  };
}

/**
 * WebPage/CollectionPage node tying a route back to the site-level Organization
 * and WebSite graph declared once in app/layout.tsx (@id `${SITE_URL}/#website`).
 * Without the isPartOf link each page's markup is an island and the entity
 * signals on the layout graph don't propagate.
 */
export function webPage(opts: {
  name: string;
  href: string;
  description?: string;
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage";
}) {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    name: opts.name,
    url: absolute(opts.href),
    ...(opts.description ? { description: opts.description } : {}),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#org` },
  };
}

/** FAQPage from a plain Q&A list. Returns null for an empty list so callers can
 *  spread it conditionally rather than emitting an FAQPage with no questions,
 *  which Search Console flags. */
export function faqPage(faqs: { q: string; a: string }[]) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Convenience: serialise one or more JSON-LD nodes for dangerouslySetInnerHTML,
 *  dropping nulls so `faqPage(...)` can be passed straight in. */
export function ldJson(...nodes: (object | null | undefined)[]): string {
  const kept = nodes.filter(Boolean);
  return JSON.stringify(kept.length === 1 ? kept[0] : kept);
}
