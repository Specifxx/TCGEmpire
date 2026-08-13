"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/articles";
import { fmtDate } from "@/components/ArticleList";
import { Picture } from "@/components/Picture";

// A named group of articles, surfaced as a topic BUTTON under the Latest list.
// Matched by tag; `accent` is a hex colour for the button's dot, purely decorative.
export interface ArticleSection {
  title: string;
  tags: string[];
  accent: string;
  cap?: number; // show at most this many, then a "See all" link (default: no cap)
  moreHref?: string;
  moreLabel?: string; // default "See all →"
}

// Days-old threshold for the "New" badge — purely derived from each article's own
// real `date` field at render time, never a fabricated flag.
const NEW_DAYS = 5;
function isNew(dateIso: string): boolean {
  const days = (Date.now() - new Date(dateIso + "T00:00:00").getTime()) / 86_400_000;
  return days >= 0 && days <= NEW_DAYS;
}

// How many of the newest posts show before "Show all" — 9 fills three rows on
// desktop, one screen on mobile.
const LATEST_VISIBLE = 9;

// Blog/guides index.
//
// LAYOUT (rebuilt): the page used to open with a curated "Most read" strip and
// then several tag-bucketed sections, which buried the newest posts — a reader
// asking "what's new?" had to scan every section, because recency was never the
// organising axis anywhere on the page.
//
// Now: ONE "Latest" list of every post in date order at the top (capped, with a
// Show-all toggle), and below it nothing but topic BUTTONS. Picking a topic swaps
// the list for that topic's posts. Recency is the default; topics are one click.
//
// SEO NOTE — load-bearing: every article is rendered into the DOM server-side and
// the cap is applied with a `hidden` CLASS, never by slicing the array. Crawlers
// therefore still see all links on first paint, exactly as before. Do not
// "optimise" this into a .slice() — that would silently drop most of the internal
// links on both index pages.
export function FilterableArticles({
  articles,
  basePath,
  sections,
  featured,
}: {
  articles: Article[];
  basePath: string;
  sections?: ArticleSection[];
  featured?: string[]; // article slugs, most-read first
}) {
  // Which topic button is active. null = the default Latest view.
  const [view, setView] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(false);

  const searching = q.trim().length > 0;

  const searched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(needle) ||
        a.excerpt.toLowerCase().includes(needle) ||
        a.tags.some((t) => t.toLowerCase().includes(needle))
    );
  }, [articles, q]);

  const featuredArticles = useMemo(() => {
    if (!featured?.length) return [];
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    return featured.map((s) => bySlug.get(s)).filter((a): a is Article => !!a);
  }, [articles, featured]);

  // Bucket into topics by tag (first matching section wins, so an article never
  // appears in two buckets); anything matching nothing lands in a trailing
  // "More" group so no post is unreachable by topic.
  const groups = useMemo(() => {
    const out: { title: string; accent: string; items: Article[]; moreHref?: string; moreLabel?: string }[] = [];
    if (featuredArticles.length) out.push({ title: "Most read", accent: "#eab308", items: featuredArticles });
    if (sections?.length) {
      const used = new Set(featuredArticles.map((a) => a.slug));
      for (const sec of sections) {
        const items = articles.filter((a) => !used.has(a.slug) && a.tags.some((t) => sec.tags.includes(t)));
        for (const a of items) used.add(a.slug);
        if (items.length) out.push({ title: sec.title, accent: sec.accent, items, moreHref: sec.moreHref, moreLabel: sec.moreLabel });
      }
      const rest = articles.filter((a) => !used.has(a.slug));
      if (rest.length) out.push({ title: "More", accent: "#64748b", items: rest });
    }
    return out;
  }, [articles, sections, featuredArticles]);

  const activeGroup = view ? groups.find((g) => g.title === view) ?? null : null;
  const hiddenCount = Math.max(0, articles.length - LATEST_VISIBLE);

  return (
    <div>
      {/* Search — kept compact; it overrides both the Latest list and any topic. */}
      <div className="mb-5 flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles…"
            aria-label="Search articles"
            className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-7 pr-2.5 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 sm:min-h-0"
          />
        </div>
        {searching && (
          <span className="shrink-0 text-xs text-slate-500">
            {searched.length} {searched.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {searching ? (
        searched.length === 0 ? (
          <div className="card-surface grid place-items-center p-12 text-center text-slate-400">
            <div>
              <p className="text-base font-semibold text-white">No matches</p>
              <p className="mt-1 text-sm">
                Nothing matched that search.{" "}
                <button onClick={() => setQ("")} className="text-brand-300 hover:underline">Clear</button>
              </p>
            </div>
          </div>
        ) : (
          <Grid>
            {searched.map((a) => (
              <ArticleCard key={a.slug} a={a} basePath={basePath} />
            ))}
          </Grid>
        )
      ) : activeGroup ? (
        /* ── A topic is selected ─────────────────────────────────────────── */
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: activeGroup.accent }} aria-hidden />
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">{activeGroup.title}</h2>
              <span className="text-xs text-slate-500">· {activeGroup.items.length}</span>
            </div>
            <button
              onClick={() => setView(null)}
              className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
            >
              ← Back to latest
            </button>
          </div>
          <Grid>
            {activeGroup.items.map((a) => (
              <ArticleCard key={a.slug} a={a} basePath={basePath} />
            ))}
          </Grid>
          {activeGroup.moreHref && (
            <Link href={activeGroup.moreHref} className="mt-3 inline-block text-sm font-semibold text-brand-300 hover:underline">
              {activeGroup.moreLabel ?? "See all →"}
            </Link>
          )}
          <TopicButtons groups={groups} active={view} onPick={setView} className="mt-10" />
        </div>
      ) : (
        /* ── Default: Latest, then topic buttons ─────────────────────────── */
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">Latest</h2>
            <span className="text-xs text-slate-500">· {articles.length}</span>
          </div>

          {/* Every article is in the DOM; the cap is a `hidden` class, not a slice
              (see the SEO note on this component). */}
          <Grid>
            {articles.map((a, i) => (
              <ArticleCard
                key={a.slug}
                a={a}
                basePath={basePath}
                className={!expanded && i >= LATEST_VISIBLE ? "hidden" : undefined}
              />
            ))}
          </Grid>

          {hiddenCount > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="rounded-lg border border-ink-700 bg-ink-850 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-brand-500 hover:text-white"
              >
                {expanded ? "Show fewer" : `Show all ${articles.length} →`}
              </button>
            </div>
          )}

          <TopicButtons groups={groups} active={view} onPick={setView} className="mt-10" />
        </div>
      )}
    </div>
  );
}

// The only thing below the Latest list: one button per topic.
function TopicButtons({
  groups,
  active,
  onPick,
  className = "",
}: {
  groups: { title: string; accent: string; items: Article[] }[];
  active: string | null;
  onPick: (t: string | null) => void;
  className?: string;
}) {
  if (groups.length === 0) return null;
  return (
    <div className={className}>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Browse by topic</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const on = active === g.title;
          return (
            <button
              key={g.title}
              onClick={() => onPick(on ? null : g.title)}
              aria-pressed={on}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                on
                  ? "border-brand-500 bg-brand-500/10 text-white"
                  : "border-ink-700 bg-ink-850 text-slate-200 hover:border-brand-500/60 hover:bg-ink-800"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.accent }} aria-hidden />
                <span className="truncate">{g.title}</span>
              </span>
              <span className="shrink-0 text-xs font-normal text-slate-500">{g.items.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function ArticleCard({
  a,
  basePath,
  popular,
  className = "",
}: {
  a: Article;
  basePath: string;
  popular?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`${basePath}/${a.slug}`}
      className={`card-surface group relative flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-glow ${
        popular ? "border-gold/40" : ""
      } ${className}`}
    >
      {/* Real card art when the article has one — most don't yet, so this is
          conditional rather than a reserved-but-empty box (see LatestPosts.tsx
          for the "always reserve the slot" version, appropriate there because it
          only ever shows 3 curated posts). aspect-[1.91/1] + object-cover crops
          a portrait card photo to a scannable landscape strip, the same treatment
          the homepage teaser row already uses for consistency. */}
      {a.hero && (
        <div className="relative aspect-[1.91/1] w-full shrink-0 overflow-hidden bg-ink-900">
          <Picture
            src={a.hero.src}
            alt={a.hero.alt}
            width={744}
            height={1039}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {popular && <span className="chip bg-gold/15 font-semibold text-gold">Popular</span>}
          {isNew(a.date) && <span className="chip bg-brand-500/15 font-semibold text-brand-300">New</span>}
          {a.tags.slice(0, popular || isNew(a.date) ? 2 : 3).map((t) => (
            <span key={t} className="chip bg-ink-800 text-slate-400">{t}</span>
          ))}
        </div>
        <h2 className="mt-2 text-lg font-bold text-white">{a.title}</h2>
        <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-400">{a.excerpt}</p>
        <div className="mt-3 text-xs text-slate-500">
          {fmtDate(a.date)} · {a.readMins} min read
        </div>
      </div>
    </Link>
  );
}
