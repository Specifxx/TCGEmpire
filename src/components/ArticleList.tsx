import Link from "next/link";
import type { Article } from "@/lib/articles";

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Card grid of articles, used by both the Blog and Guides list pages.
export function ArticleList({ articles, basePath }: { articles: Article[]; basePath: string }) {
  if (articles.length === 0) {
    return (
      <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
        <div>
          <p className="text-lg font-semibold text-white">Nothing here yet</p>
          <p className="mt-1 text-sm">New articles are on the way.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {articles.map((a) => (
        <Link
          key={a.slug}
          href={`${basePath}/${a.slug}`}
          className="card-surface flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:shadow-glow"
        >
          <div className="flex flex-wrap gap-1.5">
            {a.tags.slice(0, 3).map((t) => (
              <span key={t} className="chip bg-ink-800 text-slate-400">{t}</span>
            ))}
          </div>
          <h2 className="mt-2 text-lg font-bold text-white">{a.title}</h2>
          <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-400">{a.excerpt}</p>
          <div className="mt-3 text-xs text-slate-500">
            {fmtDate(a.date)} · {a.readMins} min read
          </div>
        </Link>
      ))}
    </div>
  );
}

export { fmtDate };
