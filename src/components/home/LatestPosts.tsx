import Link from "next/link";
import Image from "next/image";
import type { Article } from "@/lib/articles";

function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// Latest-content teaser — 3 items near the bottom of the homepage (above the SEO
// prose). Fresh internal links + fresh content on the homepage help crawl
// frequency and long-tail discovery. getArticles() is already newest-first, so
// this is just its top slice — no new sort/fetch logic, and it costs no DB query
// (ARTICLES is an in-memory list).
//
// Renders EITHER category — guides or blog posts — since both are Articles and
// render identically here; only the heading/link copy and which slice of
// getArticles() is passed in differ (see HomeSections.tsx, which mounts one of
// each). The only per-item thing that has to stay dynamic either way is where
// each card links: a guide lives at /guides/<slug> and a blog post at
// /blog/<slug>, and the wrong prefix is a hard 404 because each route asserts
// the category (see app/guides/[slug]/page.tsx) — hence articleHref() deriving
// the path from the article itself instead of a prop, so this can never
// mismatch its own posts.
function articleHref(a: Article): string {
  return a.category === "guide" ? `/guides/${a.slug}` : `/blog/${a.slug}`;
}

export function LatestPosts({
  posts,
  heading,
  subhead,
  seeAllHref,
  seeAllLabel,
}: {
  posts: Article[];
  heading: string;
  subhead: string;
  seeAllHref: string;
  seeAllLabel: string;
}) {
  if (posts.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-white">{heading}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subhead}</p>
        </div>
        <Link href={seeAllHref} className="btn-ghost hidden text-xs sm:inline-flex">
          {seeAllLabel} →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={articleHref(p)}
            className="card-surface group flex flex-col overflow-hidden transition-colors hover:border-brand-500/60 hover:bg-ink-800"
          >
            {/* Fixed aspect box either way — a post without a hero image (most
                don't have one yet; see scripts/gen-blog-heroes.ts) gets a plain
                branded placeholder, never a missing/broken image, and every
                card in the row stays the same height. */}
            {/* ABSOLUTELY POSITIONED, AND THAT IS LOAD-BEARING (2026-09-22).
                Reported as "the website is way too small for phone"; /au
                measured 608px wide on a 390px phone and Chrome for Android
                answers content wider than the viewport by widening the LAYOUT
                viewport and scaling the whole page down — then remembering
                that zoom per site, so every page looks shrunken afterwards.

                The image was in normal flow at its intrinsic 600px. Its
                `w-full` resolves against the nearest block box, and the
                aspect-ratio box's real child is a wrapper with no width of its
                own, so on a real phone (reproduces at devicePixelRatio 2, not
                at 1 — which is why a desktop browser at 390px looks fine) the
                intrinsic width won and the page grew by 218px.

                `absolute inset-0` inside the `relative` aspect box takes the
                image out of flow completely, so it cannot contribute to any
                ancestor's width under any srcset, DPR or CSS-timing condition.
                A width utility can lose; being out of flow cannot. */}
            <div className="relative aspect-[1.91/1] w-full shrink-0 overflow-hidden bg-ink-900">
              {p.hero ? (
                <Image
                  src={p.hero.src}
                  alt={p.hero.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  loading="lazy"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
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
