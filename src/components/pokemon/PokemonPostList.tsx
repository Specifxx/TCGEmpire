import Link from "next/link";
import { formatDay } from "@/lib/pokemon/format";

// A list of Pokémon blog posts: the blog index and the "more posts" band under
// a post. Takes trimmed fields only. A draft carries a visible label, because
// drafts only ever render where a reviewer is reading them (dev, preview).

export interface PokemonPostListItem {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  draft: boolean;
}

export function PokemonPostList({ posts, compact = false, headingLevel = 2 }: { posts: PokemonPostListItem[]; compact?: boolean; headingLevel?: 2 | 3 }) {
  if (!posts.length) return null;
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <ul className={`grid grid-cols-1 gap-3 ${compact ? "sm:grid-cols-2" : ""}`}>
      {posts.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/pokemon/blog/${p.slug}`}
            className="card-surface flex h-full flex-col gap-1.5 p-4 transition-colors hover:border-brand-500 hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {p.draft && <span className="chip bg-amber-500/15 font-semibold text-amber-300">Draft</span>}
              <time dateTime={p.date}>{formatDay(p.date)}</time>
            </span>
            <H className={`font-bold text-white ${compact ? "text-base" : "text-lg"}`}>{p.title}</H>
            <span className={`text-sm text-slate-400 ${compact ? "line-clamp-2" : ""}`}>{p.excerpt}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
