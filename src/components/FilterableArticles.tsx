"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Article } from "@/lib/articles";
import { fmtDate } from "@/components/ArticleList";

// A named group of articles for the default (unfiltered) view — e.g. "Vendetta
// Guides" or "Buying & Value". Matched by tag; `accent` is a hex colour for the
// section's heading dot, purely decorative (no new data).
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

// Client-side tag + text filter over a list of articles. The full list is rendered
// server-side (so crawlers still see every article and every link); this just
// hides/shows cards in the browser — no network, no loss of SEO.
//
// Default (no search/topic filter) view: an optional "Most read" strip (explicit,
// curated slugs — picked from real traffic, not a live/self-updating ranking) then
// the rest of the articles grouped into `sections`. Any article matching no
// section's tags falls into a "More" bucket so nothing silently disappears.
// Once the visitor searches or picks a topic, it flattens to one filtered grid —
// familiar "browse by category, search when you know what you want" pattern.
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
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);

  // Tags ranked by how many articles carry them (most useful filters first).
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [articles]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return articles.filter((a) => {
      if (tag && !a.tags.includes(tag)) return false;
      if (!needle) return true;
      return (
        a.title.toLowerCase().includes(needle) ||
        a.excerpt.toLowerCase().includes(needle) ||
        a.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [articles, tag, q]);

  const isDefaultView = !tag && !q.trim();

  const featuredArticles = useMemo(() => {
    if (!featured?.length) return [];
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    return featured.map((s) => bySlug.get(s)).filter((a): a is Article => !!a);
  }, [articles, featured]);

  // Bucket the rest into `sections` by tag (first matching section wins, so an
  // article never appears twice); anything matching no section's tags lands in a
  // trailing "More" group instead of silently vanishing.
  const grouped = useMemo(() => {
    if (!sections?.length) return null;
    const used = new Set(featuredArticles.map((a) => a.slug));
    const groups = sections.map((sec) => {
      const items = articles.filter((a) => !used.has(a.slug) && a.tags.some((t) => sec.tags.includes(t)));
      for (const a of items) used.add(a.slug);
      return { title: sec.title, accent: sec.accent, items, cap: sec.cap, moreHref: sec.moreHref, moreLabel: sec.moreLabel };
    });
    const rest = articles.filter((a) => !used.has(a.slug));
    return { groups, rest };
  }, [articles, sections, featuredArticles]);

  const showSectioned = isDefaultView && (featuredArticles.length > 0 || (grouped?.groups.some((g) => g.items.length) ?? false) || (grouped?.rest.length ?? 0) > 0);

  return (
    <div>
      {/* Controls: one compact row — search + a collapsed "Topics" toggle (mirrors
          the database filter's compact pattern), chips only when expanded. */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">⌕</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search articles…"
              aria-label="Search articles"
              className="w-full rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-7 pr-2.5 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
            />
          </div>
          <button
            type="button"
            aria-expanded={tagsOpen}
            onClick={() => setTagsOpen((o) => !o)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              tag ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 bg-ink-850 text-slate-300 hover:border-brand-500/50"
            }`}
          >
            Topics
            {tag && <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] text-white">1</span>}
            <svg className={`h-3 w-3 transition-transform ${tagsOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {tag && !tagsOpen && (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="chip shrink-0 border border-brand-500/50 bg-brand-500/10 px-2 py-1 text-[11px] text-brand-300 hover:border-brand-500"
              aria-label={`Clear topic filter ${tag}`}
            >
              {tag} ✕
            </button>
          )}
        </div>
        {tagsOpen && (
          <div className="mt-2 flex flex-wrap gap-1">
            <FilterChip active={tag === null} onClick={() => setTag(null)}>
              All <span className="text-slate-500">· {articles.length}</span>
            </FilterChip>
            {tags.map(([t, n]) => (
              <FilterChip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                {t} <span className={tag === t ? "text-brand-200/70" : "text-slate-500"}>· {n}</span>
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-slate-400">
          <div>
            <p className="text-base font-semibold text-white">No matches</p>
            <p className="mt-1 text-sm">
              Nothing matched that filter.{" "}
              <button
                onClick={() => {
                  setTag(null);
                  setQ("");
                }}
                className="text-brand-300 hover:underline"
              >
                Clear filters
              </button>
            </p>
          </div>
        </div>
      ) : showSectioned ? (
        <div className="flex flex-col gap-8">
          {featuredArticles.length > 0 && (
            <div>
              <SectionHeading title="Most read" accent="#eab308" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featuredArticles.map((a) => (
                  <ArticleCard key={a.slug} a={a} basePath={basePath} popular />
                ))}
              </div>
            </div>
          )}
          {grouped?.groups.map((g) => {
            if (g.items.length === 0) return null;
            const shown = g.cap ? g.items.slice(0, g.cap) : g.items;
            const hiddenCount = g.items.length - shown.length;
            return (
              <div key={g.title}>
                <SectionHeading title={g.title} accent={g.accent} count={g.items.length} />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((a) => (
                    <ArticleCard key={a.slug} a={a} basePath={basePath} />
                  ))}
                </div>
                {hiddenCount > 0 && g.moreHref && (
                  <Link href={g.moreHref} className="mt-3 inline-block text-sm font-semibold text-brand-300 hover:underline">
                    {g.moreLabel ?? `See all ${g.items.length} →`}
                  </Link>
                )}
              </div>
            );
          })}
          {grouped && grouped.rest.length > 0 && (
            <div>
              <SectionHeading title="More" accent="#64748b" count={grouped.rest.length} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.rest.map((a) => (
                  <ArticleCard key={a.slug} a={a} basePath={basePath} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <ArticleCard key={a.slug} a={a} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, accent, count }: { title: string; accent: string; count?: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">{title}</h2>
      {count != null && <span className="text-xs text-slate-500">· {count}</span>}
    </div>
  );
}

function ArticleCard({ a, basePath, popular }: { a: Article; basePath: string; popular?: boolean }) {
  return (
    <Link
      href={`${basePath}/${a.slug}`}
      className={`card-surface relative flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-glow ${
        popular ? "border-gold/40" : ""
      }`}
    >
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
    </Link>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`chip border px-2 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "border-brand-500 bg-brand-500/15 text-brand-300"
          : "border-ink-700 text-slate-400 hover:border-brand-500/50 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
