import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/lib/articles";

function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Latest-content teaser — the 3 most recent posts, near the bottom of the
// homepage (above the SEO prose). Fresh internal links + fresh content on the
// homepage help crawl frequency and long-tail discovery. getBlogPosts() is
// already newest-first (lib/posts.ts), so this is just its top slice — no new
// sort/fetch logic, and it costs no DB query (ARTICLES is an in-memory list).
export function LatestPosts({ posts }: { posts: Article[] }) {
  if (posts.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">Latest from the blog</h2>
          <p className="mt-0.5 text-xs text-slate-500">Market analysis, guides and news.</p>
        </div>
        <Link href="/blog" className="btn-ghost hidden text-xs sm:inline-flex">
          See all posts →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="card-surface group flex flex-col overflow-hidden transition-colors hover:border-brand-500/60 hover:bg-ink-800"
          >
            {/* Fixed aspect box either way — a post without a hero image (most
                don't have one yet; see scripts/gen-blog-heroes.ts) gets a plain
                branded placeholder, never a missing/broken image, and every
                card in the row stays the same height. */}
            <div className="relative aspect-[1.91/1] w-full shrink-0 overflow-hidden bg-ink-900">
              {p.hero ? (
                <Image
                  src={p.hero.src}
                  alt={p.hero.alt}
                  width={600}
                  height={314}
                  sizes="(max-width: 640px) 100vw, 33vw"
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-800 to-ink-900" aria-hidden="true">
                  <span className="rb-eyebrow text-slate-700">RiftCompare</span>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{formatPostDate(p.date)}</span>
              <h3 className="line-clamp-2 text-sm font-bold text-white">{p.title}</h3>
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">{p.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
