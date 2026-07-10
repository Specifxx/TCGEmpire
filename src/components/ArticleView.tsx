import Link from "next/link";
import type { Article, ArticleCloseUp, ArticleEmbed } from "@/lib/articles";
import { prisma } from "@/lib/db";
import { cardTileSelect } from "@/lib/cards";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { CardTile, type CardTileData } from "./CardTile";
import { Markdown } from "./Markdown";
import { fmtDate } from "./ArticleList";
import { AdSlot } from "./AdSlot";
import { ArticleShopStrip } from "./ArticleShopStrip";
import { SITE_URL } from "@/lib/site";

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
    if (e.chaseSet && e.chaseTier) {
      // Tier slices need the num>total comparison, so fetch the set and filter here.
      const rows = await prisma.card.findMany({
        where: { setCode: e.chaseSet, isPromo: false },
        orderBy: [{ collectorNumber: "asc" }],
        select,
      });
      const all = rows as unknown as (CardTileData & { collectorNumber: string; rarity: string; variant: string | null })[];
      const tier =
        e.chaseTier === "overnumbered"
          ? all.filter(isOvernumbered)
          : e.chaseTier === "altart"
          ? all.filter((c) => c.variant != null)
          : all.filter((c) => c.rarity === "Epic" && c.variant == null && !isOvernumbered(c) && !c.collectorNumber.includes("*"));
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
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      </section>
    );
  }
  if (embed.chaseSet) {
    return (
      <p className="mt-8 rounded-xl border border-ink-700 bg-ink-850 p-4 text-sm text-slate-400">
        🃏 {embed.title}: cards appear here as they're revealed and added to the database — check back through
        spoiler season.
      </p>
    );
  }
  return null;
}

export async function ArticleView({ article }: { article: Article }) {
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
  const isGuide = article.category === "guide";
  const backHref = isGuide ? "/guides" : "/blog";
  const backLabel = isGuide ? "All guides" : "All posts";

  const articleUrl = `${SITE_URL}/${isGuide ? "guides" : "blog"}/${article.slug}`;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": isGuide ? "TechArticle" : "BlogPosting",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.date,
    // dateModified defaults to the publish date until an article carries an
    // explicit `updated` — never older than datePublished.
    dateModified: article.updated ?? article.date,
    author: { "@type": "Organization", name: article.author },
    publisher: { "@type": "Organization", name: "RiftCompare" },
    mainEntityOfPage: articleUrl,
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

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([articleLd, breadcrumbLd]) }} />

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
        {article.author} · {fmtDate(article.date)} · {article.readMins} min read
      </div>

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
      {article.shop && article.shop.length > 0 && <ArticleShopStrip items={article.shop} />}

      <AdSlot className="mt-8" height={120} />
    </article>
  );
}
