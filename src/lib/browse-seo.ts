// /browse's metadata and canonical rules, shared by app/browse/page.tsx (the
// CDN-kept card list) and app/browse/search/page.tsx (a text search, metered
// per visitor; 2026-11-05, DECISIONS.md "The card list becomes one CDN copy
// per URL"). One implementation, so the two routes can never disagree about a
// title, a canonical or a noindex.
import type { Metadata } from "next";
import { prisma } from "./db";
import { parsePageNum, parsePageSize, type CardQuery } from "./cards";
import type { BrowseParams } from "./browse-view";

// Browse is the main "buy Riftbound cards" landing page, so give it a strong title
// and description. Metadata is market-neutral: Googlebot crawls mostly from US IPs,
// so geo-derived copy would index the US variant for every market. Internal
// search-result views (?q=) are noindex'd (Google discourages indexing site-search
// results) and canonicalise to the clean /browse.
//
// Pagination canonicals: ONLY the clean default view (?page=N and nothing else)
// self-canonicalises — per Google's guidance paginated pages are not duplicates of
// page 1, and folding them into /browse discards the card links only those pages
// carry. Any sized/sorted/filtered variant still canonicalises to /browse (its
// content is a permutation, and /browse?page=2&size=10 shows entirely different
// cards than /browse?page=2 — they must never share a canonical). Out-of-range
// pages are noindex'd so the scheme can't manufacture indexable empty soft-404s.
//
// RE-CONFIRMED, not changed, by a later audit that flagged this as a duplicate-
// canonical bug and pointed at /blog and /gallery as the "correct" model. Neither
// is actually comparable: /blog's `?page=` and /gallery's are not read by either
// route at all (both paginate, if at all, purely client-side over a page that
// serves the SAME full HTML regardless of the query string) — their shared
// canonical is a side effect of having nothing paginated to protect, not a
// deliberate pagination policy. /browse is the one route on this site with REAL
// server-driven pagination (Prisma skip/take produces a genuinely different card
// set per page), which is exactly the case Google's pagination guidance is about,
// and self-referencing canonicals are what that guidance actually recommends —
// canonicalising every page back to page 1 would tell Google pages 2-15 are
// duplicates and drop their card links from the index, the opposite of the fix
// asked for. The real, separate bug that audit also found — every paginated
// page sharing byte-identical title/description with page 1 — is fixed below
// instead, without touching canonicalization.
export const isCleanPagination = (searchParams: CardQuery) =>
  Object.entries(searchParams).every(([k, v]) => k === "page" || v == null || v === "");

export async function browseMetadata(searchParams: BrowseParams): Promise<Metadata> {
  const q = (searchParams.q ?? "").trim();
  const page = parsePageNum(searchParams.page);
  // Title leads with the exact phrase "Riftbound Card List" (2026-09-17). This
  // page is the OWNER of that query — see docs/seo-keyword-map.md, whose row for
  // it pointed at `/guides/riftbound-card-list` as "not yet built" for a month
  // after backlog item 12 had already been closed by shipping
  // `/guides/riftbound-sets-in-order`. That guide answers a genuinely different
  // question (which SETS exist, in release order); nobody typing "riftbound card
  // list" wants a set list, they want the list of cards — which is this page, and
  // has been all along. The map row is corrected rather than a third page built,
  // per that file's own rule 5 (publish fewer pages than feels natural).
  //
  // It REPLACES the exact phrase "Riftbound Cards" that the 2026-08-20 audit
  // front-loaded here, deliberately and with the same reasoning that audit used:
  // one page, one exact-match phrase. "Riftbound Card" survives inside "Card
  // List" for the singular query, the H1/subhead/JSON-LD below still say
  // "Riftbound cards" verbatim, and `/cards` ("Browse Riftbound Cards by Type,
  // Rarity & Printing") keeps a title-level exact match on the plural.
  //
  // The /browse-vs-"/" split that audit established is UNCHANGED and is what
  // makes this safe: /browse owns card-database/list intent, "/" owns
  // comparison intent ("Riftbound prices", "riftbound price check"). Neither
  // title now contains the other's phrase.
  // NO manual "| RiftCompare" suffix — title is a plain string here (not
  // wrapped in { absolute: ... }), so layout.tsx's title template ("%s —
  // RiftCompare") already appends it once; adding it by hand doubled the
  // suffix ("... | RiftCompare — RiftCompare"), caught visually while
  // verifying this change.
  //
  // PAGE-AWARE title/description (page > 1): a later audit found every
  // paginated view sharing byte-identical title/description with page 1 —
  // fixed here, belt-and-suspenders alongside each page's own self-referencing
  // canonical below (see isCleanPagination's comment for why that canonical
  // stays self-referencing rather than pointing at page 1 — this is the other,
  // independent half of the same finding: even pages that are correctly NOT
  // duplicates of each other in Google's eyes still read as one in the SERP
  // snippet if the words are identical, which is a real CTR cost regardless of
  // canonicalization).
  const pageSuffix = page > 1 ? ` — Page ${page}` : "";
  const base = {
    title: q ? `${q} — Riftbound cards & prices${pageSuffix}` : `Riftbound Card List — Browse & Compare Prices${pageSuffix}`,
    // Market list corrected to all six tracked markets while this copy was being
    // rewritten anyway: it still said "AU, US, UK & SG" — the set of markets as
    // they stood before Canada (2026-08) and the EU (2026-08-23) launched, both
    // of which the homepage description has named for weeks.
    description:
      page > 1
        ? `The full Riftbound card list — every card in one database, with live prices across US, AU, UK, Singapore, Canada & EU stores. Page ${page}.`
        : "The full Riftbound card list — every card in one database, with live prices compared across US, AU, UK, Singapore, Canada & EU stores. Updated twice a day.",
  };
  if (q) return { ...base, alternates: { canonical: "/browse" }, robots: { index: false, follow: true } };
  if (page > 1 && isCleanPagination(searchParams)) {
    // Guard the self-canonical against out-of-range pages (a 200 with an empty
    // grid must not become an indexable canonical target). Default page size —
    // the clean view has no size param by definition.
    const total = await prisma.card.count().catch(() => 0);
    const totalPages = Math.max(1, Math.ceil(total / parsePageSize(undefined)));
    if (page > totalPages) return { ...base, alternates: { canonical: "/browse" }, robots: { index: false, follow: true } };
    return { ...base, alternates: { canonical: `/browse?page=${page}` } };
  }
  return { ...base, alternates: { canonical: "/browse" } };
}
