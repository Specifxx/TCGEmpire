import Link from "next/link";
import type { Article, ArticleCloseUp, ArticleEmbed } from "@/lib/articles";
import { ARTICLES } from "@/lib/articles";
import { prisma } from "@/lib/db";
import { cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CardTile, type CardTileData } from "./CardTile";
import { FilterableCardGallery } from "./FilterableCardGallery";
import { Markdown } from "./Markdown";
import { fmtDate } from "./ArticleList";
import { AdSlot } from "./AdSlot";
import { ArticleShopStrip } from "./ArticleShopStrip";
import { EbayPicks } from "./EbayPicks";
import { ArticleMarketData } from "./ArticleMarketData";
import { authorByName, authorJsonLd } from "@/lib/content/authors";
import { SITE_URL } from "@/lib/site";
import { extractToc } from "@/lib/toc";
import { AnswerBox } from "./AnswerBox";
import { ArticleToc } from "./ArticleToc";
import { ArticleFaq } from "./ArticleFaq";
import { ArticleShare } from "./ArticleShare";
import { ArticleTopValue } from "./ArticleTopValue";
import { Picture } from "./Picture";

// A card printed beyond the set's total (e.g. 167/166) or carrying an SP special
// number — the "overnumbered" chase class. Signature "*" prints are their own thing
// and excluded here. Classified in JS because SQL can't compare the two halves of
// the "num/total" collector-number string.
function isOvernumbered(c: { collectorNumber: string }): boolean {
  if (/^sp/i.test(c.collectorNumber)) return true;
  if (c.collectorNumber.includes("*")) return false;
  const [n, t] = c.collectorNumber.split("/");
  const ni = parseInt(n, 10);
  const ti = parseInt(t ?? "", 10);
  return Number.isFinite(ni) && Number.isFinite(ti) && ni > ti;
}

// Resolve one embedded card gallery to real card rows. Resilient: any DB error (or
// the build sandbox's missing DATABASE_URL) → [] and the article still renders.
// `slugs` preserves the author's order; `chaseSet` self-populates with the set's
// chase-tier printings (optionally one `chaseTier` slice) so a spoiler-season
// gallery fills as reveals are imported — no fabricated cards, ever.
async function resolveEmbed(e: ArticleEmbed | undefined): Promise<CardTileData[]> {
  if (!e) return [];
  const select = cardTileSelect(DEFAULT_COUNTRY);
  try {
    if (e.slugs?.length) {
      const rows = await prisma.card.findMany({ where: { slug: { in: e.slugs } }, select });
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return e.slugs.map((sl) => bySlug.get(sl)).filter(Boolean) as unknown as CardTileData[];
    }
    if (e.rulesContain) {
      const rows = await prisma.card.findMany({
        where: {
          ...(e.rulesSet ? { setCode: e.rulesSet } : {}),
          description: { contains: e.rulesContain },
        },
        orderBy: [{ rarity: "asc" }, { collectorNumber: "asc" }],
        take: e.take ?? 12,
        select,
      });
      return rows as unknown as CardTileData[];
    }
    if (e.setAll) {
      // EVERY card of a set (spoiler-tracker galleries) — ordered by collector
      // number, generous default cap so a full set fits. createdAt is included so a
      // filterable gallery can offer a "most recently added" sort (= newest reveal).
      const rows = await prisma.card.findMany({
        where: { setCode: e.setAll, isPromo: false },
        orderBy: [{ collectorNumber: "asc" }],
        take: e.take ?? 400,
        select: { ...select, createdAt: true },
      });
      return rows.map((r) => {
        const { createdAt, ...rest } = r as typeof r & { createdAt: Date };
        return { ...rest, createdAt: createdAt.toISOString() };
      }) as unknown as CardTileData[];
    }
    if (e.chaseSet && e.chaseTier) {
      // Tier slices need the num>total comparison, so fetch the set and filter here.
      // Promos are included in the fetch (they're their own tier) and excluded from
      // every other tier — one tier per card keeps the post's framing.
      const rows = await prisma.card.findMany({
        where: { setCode: e.chaseSet },
        orderBy: [{ collectorNumber: "asc" }],
        select,
      });
      const all = rows as unknown as (CardTileData & { collectorNumber: string; rarity: string; variant: string | null; isPromo: boolean })[];
      const tier =
        e.chaseTier === "signature"
          ? all.filter((c) => !c.isPromo && c.collectorNumber.includes("*"))
          : e.chaseTier === "overnumbered"
          ? all.filter((c) => !c.isPromo && isOvernumbered(c))
          : e.chaseTier === "promo"
          ? all.filter((c) => c.isPromo)
          : e.chaseTier === "altart"
          ? all.filter((c) => !c.isPromo && c.variant != null && !isOvernumbered(c) && !c.collectorNumber.includes("*"))
          : all.filter((c) => !c.isPromo && c.rarity === "Epic" && c.variant == null && !isOvernumbered(c) && !c.collectorNumber.includes("*"));
      return tier.slice(0, e.take ?? 24);
    }
    if (e.chaseSet) {
      const rows = await prisma.card.findMany({
        where: {
          setCode: e.chaseSet,
          OR: [
            { rarity: { in: ["Showcase", "Epic"] } },
            { collectorNumber: { contains: "*" } },
            { variant: { not: null } },
          ],
        },
        orderBy: [{ rarity: "asc" }, { collectorNumber: "asc" }],
        take: e.take ?? 12,
        select,
      });
      return rows as unknown as CardTileData[];
    }
  } catch {
    /* no DB (build sandbox) or query failure — render the article without the gallery */
  }
  return [];
}

// Riftbound portrait card images are 744×1039 (h/w ≈ 1.396). A close-up crops a
// horizontal band: the wrapper's padding-top sets the band's height (as % of card
// height, converted to %-of-width) and translateY slides the full-size image up so
// the requested region shows. Pure CSS on the official image — no derivative files.
function CardCloseUpFig({ cu, card }: { cu: ArticleCloseUp; card?: CardTileData }) {
  if (!card?.imageUrl) return null;
  const top = cu.topPct ?? 56;
  const height = cu.heightPct ?? 30;
  return (
    <figure className="my-6">
      <div
        className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900"
        style={{ paddingTop: `${(height * 1039) / 744}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageUrl}
          alt={`${card.name} — rules-text close-up`}
          loading="lazy"
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translateY(-${top}%)` }}
        />
      </div>
      <figcaption className="mt-2 text-center text-sm text-slate-400">
        {cu.caption}
        {card.slug && (
          <>
            {" "}
            <Link href={`/card/${card.slug}`} className="text-brand-400 hover:underline">
              (view {card.name} →)
            </Link>
          </>
        )}
      </figcaption>
    </figure>
  );
}

// One gallery section: title + note + CardTile grid, or (for the self-populating
// chase mode) an honest "fills as reveals land" placeholder instead of an empty box.
function EmbedGallery({ embed, cards }: { embed: ArticleEmbed; cards: CardTileData[] }) {
  if (cards.length > 0) {
    return (
      <section className="mt-8">
        <h2 className="text-xl font-extrabold text-white">{embed.title}</h2>
        {embed.note && <p className="mt-1 text-sm text-slate-400">{embed.note}</p>}
        {embed.filterable ? (
          <FilterableCardGallery cards={cards} />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </div>
        )}
      </section>
    );
  }
  if (embed.chaseSet || embed.setAll) {
    return (
      <p className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-4 text-sm text-slate-400">
        🃏 {embed.title}: cards appear here as they're revealed and added to the database — check back through
        spoiler season.
      </p>
    );
  }
  return null;
}

// "Recommended reads" — other articles sharing at least one tag, most-overlapping
// (then most-recent) first. A plain data computation, no DB call.
//
// TOPPED UP TO `take` with the newest articles in the same category when the tag
// overlap doesn't produce enough. A post with unusual tags used to render NO
// related module at all, which is the exact page where a reader has nowhere to go
// next — the opposite of what the module is for.
function relatedArticles(article: Article, take = 3): Article[] {
  const tags = new Set(article.tags);
  const scored = ARTICLES
    .filter((a) => a.slug !== article.slug && a.tags.some((t) => tags.has(t)))
    .map((a) => ({ a, overlap: a.tags.filter((t) => tags.has(t)).length }))
    .sort((x, y) => y.overlap - x.overlap || (y.a.date < x.a.date ? -1 : 1))
    .map((x) => x.a);
  if (scored.length >= take) return scored.slice(0, take);
  const seen = new Set([article.slug, ...scored.map((a) => a.slug)]);
  const filler = ARTICLES
    .filter((a) => !seen.has(a.slug) && a.category === article.category)
    .sort((x, y) => (x.date < y.date ? 1 : -1));
  return [...scored, ...filler].slice(0, take);
}

const DEFAULT_BROWSE_CTA = {
  href: "/browse",
  label: "Browse the card database →",
  blurb: "Compare live prices for every Riftbound single across every store we track.",
};

export async function ArticleView({ article }: { article: Article }) {
  const related = relatedArticles(article);
  const cta = article.browseCta ?? DEFAULT_BROWSE_CTA;

  // All galleries: `embeds` (positioned in the body via [[embed:N]] markers) plus
  // the legacy single `embed` (always rendered after the body). Close-ups reuse the
  // same resolver with take:1, so they can only ever show a real imported card.
  const embeds = article.embeds ?? [];
  const closeups = article.closeups ?? [];
  const [embedsCards, closeupCards, legacyCards] = await Promise.all([
    Promise.all(embeds.map((e) => resolveEmbed(e))),
    Promise.all(closeups.map((c) => resolveEmbed({ title: "", slugs: c.slugs, rulesContain: c.rulesContain, rulesSet: c.rulesSet, take: 1 }))),
    resolveEmbed(article.embed),
  ]);
  // Split the body on [[embed:N]] / [[closeup:N]] markers. With two capture groups,
  // split() yields [text, kind, index, text, kind, index, …] — a stride of 3.
  const bodyParts = article.body.split(/^\[\[(embed|closeup):(\d+)\]\]$/m);
  const placed = new Set<number>();
  for (let i = 1; i < bodyParts.length; i += 3) {
    if (bodyParts[i] === "embed") placed.add(parseInt(bodyParts[i + 1], 10));
  }
  const toc = extractToc(article.body);
  const bodyHasFaqSection = /^##+ .*\bFAQ\b/m.test(article.body);
  const isGuide = article.category === "guide";
  const backHref = isGuide ? "/guides" : "/blog";
  const backLabel = isGuide ? "All guides" : "All posts";

  const articleUrl = `${SITE_URL}/${isGuide ? "guides" : "blog"}/${article.slug}`;
  const authorSlug = authorByName(article.author)?.slug ?? null;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": isGuide ? "TechArticle" : "BlogPosting",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    // dateModified defaults to the publish date until an article carries an
    // explicit `updated` — never older than datePublished.
    dateModified: article.updated ?? article.date,
    // Typed from lib/content/authors.ts — an Organization byline, because that
    // is what it truthfully is. See that file's header on why no Person is
    // fabricated here.
    author: authorJsonLd(article.author),
    publisher: { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "RiftCompare" },
    mainEntityOfPage: articleUrl,
    // Ties the article into the site-level graph declared once in app/layout.tsx,
    // so the Organization's entity signals propagate rather than each post being
    // an island.
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(article.hero ? { image: [`${SITE_URL}${article.hero.src}`] } : {}),
    articleSection: article.tags[0],
    wordCount: article.body.split(/\s+/).filter(Boolean).length,
  };
  // Breadcrumb mirrors the visible "← back" link: Home → Blog|Guides → {title}.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: isGuide ? "Guides" : "Blog", item: `${SITE_URL}${backHref}` },
      { "@type": "ListItem", position: 3, name: article.title, item: articleUrl },
    ],
  };
  // FAQPage schema from the article's structured `faq` field (kept in sync with
  // the visible "## X FAQ" markdown section by whoever edits the guide — see the
  // field's doc comment in lib/articles.ts). Omitted entirely when a guide
  // carries no structured FAQ, rather than parsed out of the markdown body.
  // ItemList for listicles — the ranked entities, in the order the page shows them.
  const itemListLd = article.itemList
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: article.itemList.name,
        url: articleUrl,
        numberOfItems: article.itemList.items.length,
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        itemListElement: article.itemList.items.map((it, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: it.name,
          ...(it.description ? { description: it.description } : {}),
          ...(it.url ? { url: it.url } : {}),
        })),
      }
    : null;

  const faqLd =
    article.faq && article.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: article.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([articleLd, breadcrumbLd, ...(itemListLd ? [itemListLd] : []), ...(faqLd ? [faqLd] : [])]),
        }}
      />

      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        ← {backLabel}
      </Link>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {article.tags.map((t) => (
          <span key={t} className="chip bg-ink-800 text-slate-400">{t}</span>
        ))}
      </div>

      <h1 className="text-3xl font-extrabold leading-tight text-white">{article.title}</h1>
      <div className="mt-2 text-sm text-slate-500">
        {/* The byline links to a real author page with a real bio, and to the
            editorial policy. Anonymous long-form content at scale is one of the
            strongest "machine-generated" signals a reviewer looks for. */}
        {authorSlug ? (
          <Link href={`/authors/${authorSlug}`} className="text-slate-400 underline hover:text-brand-400">
            {article.author}
          </Link>
        ) : (
          article.author
        )}{" "}
        · <time dateTime={article.date}>{fmtDate(article.date)}</time> · {article.readMins} min read
        {/* Real freshness signal — Article.updated already exists on ~30 articles
            but was never rendered anywhere, so a genuinely-refreshed guide looked
            exactly as stale as one that hadn't been touched since launch. */}
        {article.updated && article.updated !== article.date && (
          <>
            {" "}· <time dateTime={article.updated} className="text-slate-400">Updated {fmtDate(article.updated)}</time>
          </>
        )}
        {" "}·{" "}
        <Link href="/editorial-policy" className="text-slate-400 underline hover:text-brand-400">
          How we research this
        </Link>
      </div>

      <div className="mt-3">
        <ArticleShare url={articleUrl} title={article.title} />
      </div>

      {/* Featured image. `priority` because on an article this IS the LCP element,
          and <Picture> serves it as AVIF/WebP with explicit intrinsic dimensions
          from the build-time manifest, so it can't shift the layout. */}
      {article.hero && (
        <Picture
          src={article.hero.src}
          alt={article.hero.alt}
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="mt-5 h-auto w-full rounded-xl border border-ink-700"
        />
      )}

      {/* Answer-first TL;DR — the block a featured snippet or an AI answer engine
          lifts. Above the fold, above the first ad. */}
      {article.summary && article.summary.length > 0 && (
        <AnswerBox heading="The short version" points={article.summary} className="mt-5" />
      )}

      <ArticleToc entries={toc} />

      <AdSlot className="mt-6" height={120} />

      <div className="mt-6 border-t border-ink-800 pt-4">
        {/* Body chunks interleaved with their [[embed:N]] galleries / [[closeup:N]]
            figures — each sits under its own section heading instead of piling up
            at the end. Split stride is 3: text, marker kind, marker index. */}
        {bodyParts.map((part, i) => {
          if (i % 3 === 0) return part.trim() ? <Markdown key={i} content={part} /> : null;
          if (i % 3 === 2) return null; // the index token — consumed with its kind below
          const n = parseInt(bodyParts[i + 1], 10);
          if (part === "embed") {
            const e = embeds[n];
            return e ? <EmbedGallery key={i} embed={e} cards={embedsCards[n] ?? []} /> : null;
          }
          const cu = closeups[n];
          return cu ? <CardCloseUpFig key={i} cu={cu} card={closeupCards[n]?.[0]} /> : null;
        })}
      </div>

      {/* Galleries without a body marker render after the body (incl. the legacy
          single `embed`) — real CardTiles (tap → QuickView popup → card page). */}
      {embeds.map((e, n) => (placed.has(n) ? null : <EmbedGallery key={`tail-${n}`} embed={e} cards={embedsCards[n] ?? []} />))}
      {article.embed && <EmbedGallery embed={article.embed} cards={legacyCards} />}

      {/* Per-article eBay affiliate searches — the reader is at peak intent right
          after finishing the guide; this is where a well-ranking page converts. */}
      {/* Live market data BEFORE the affiliate strip — our own current figures
          lead, the commercial block follows. Same ordering principle as the card
          page (see docs/adsense-remediation.md § Phase 8). */}
      {article.marketData && <ArticleMarketData country={article.marketData} />}

      {/* Live "most expensive right now" table — real figures from the card
          database instead of a hand-typed top-10 that goes stale in a week. */}
      {article.topValue && (
        <ArticleTopValue
          country={article.topValue.country}
          take={article.topValue.take}
          heading={article.topValue.heading}
        />
      )}

      {/* The FAQ, rendered from the SAME array that feeds the FAQPage JSON-LD
          above — one source of truth, so the markup can never describe questions
          the page doesn't show.

          SKIPPED when the body already hand-writes its own "## … FAQ" section.
          Ten older articles carry both (see the `faq` field's doc comment in
          lib/articles.ts); rendering this as well would show those readers the
          same questions twice. Those articles are migrating to the structured
          field; until then the body's copy wins, because it is the one the
          author is actually maintaining. */}
      {article.faq && article.faq.length > 0 && !bodyHasFaqSection && <ArticleFaq faq={article.faq} />}

      {article.shop && article.shop.length > 0 && <ArticleShopStrip items={article.shop} />}

      {/* Tailored eBay unit, opt-in per article (lib/articles.ts's ebayPicks).
          Sits under the body where a finished reader is deciding what to buy —
          not mid-article, which would interrupt the read for the same click. */}
      {article.ebayPicks && (
        <EbayPicks
          className="mt-8"
          {...(typeof article.ebayPicks === "object"
            ? {
                ...(article.ebayPicks.setCode ? { setCode: article.ebayPicks.setCode } : {}),
                ...(article.ebayPicks.heading ? { heading: article.ebayPicks.heading } : {}),
              }
            : {})}
        />
      )}

      {/* "Ready to buy?" — every article is fundamentally about Riftbound cards, so
          always offer the direct path into the live database. Guides can override
          this to point somewhere more specific (browseCta) instead of the generic
          /browse — this is the single biggest lever for pages-per-visit, since a
          reader who finishes an article currently has nowhere obvious to go next. */}
      <section className="card-surface mt-8 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-bold text-white">Ready to buy?</h2>
          <p className="mt-1 text-sm text-slate-400">{cta.blurb}</p>
        </div>
        <Link href={cta.href} className="btn-primary shrink-0">{cta.label}</Link>
      </section>

      {/* Related guides — same-tag articles, so a reader who liked this piece has
          somewhere obvious to go next instead of bouncing. */}
      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold text-white">Recommended reads</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/${r.category === "guide" ? "guides" : "blog"}/${r.slug}`}
                className="card-surface flex flex-col gap-1 p-4 transition-colors hover:border-brand-500 hover:bg-ink-800"
              >
                <span className="line-clamp-2 font-semibold text-white">{r.title}</span>
                <span className="line-clamp-2 text-xs text-slate-500">{r.excerpt}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 pt-4">
        <ArticleShare url={articleUrl} title={article.title} />
        <Link href={backHref} className="text-sm text-slate-400 hover:text-white">
          ← {backLabel}
        </Link>
      </div>

      <AdSlot className="mt-8" height={120} />
    </article>
  );
}
