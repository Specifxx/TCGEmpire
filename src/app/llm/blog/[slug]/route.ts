import { draftNoindexHeaders } from "@/lib/articles";
import { getBlogPost } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";

// Clean markdown version of a blog post / daily market report for AI agents. The
// posts are already authored in markdown (Article.body), so this serves them raw.
//
// A day, like /blog/[slug] (ten minutes until 2026-10-14, DECISIONS.md, "Cached
// pages refresh every 6 to 24 hours", 2026-10-14). This route has no
// generateStaticParams, so on Vercel it is a plain function and `revalidate`
// alone caches nothing: the CDN header on the answer is what does. A 404
// carries no cache header, so a post published later is not hidden.
export const revalidate = 86400;

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const post = await getBlogPost(params.slug).catch(() => null);
  if (!post) return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });

  const md = [
    `# ${post.title}`,
    "",
    `_${post.date} · ${post.author}_`,
    "",
    post.excerpt,
    "",
    post.body,
    "",
    `Source: ${SITE_URL}/blog/${post.slug}`,
  ].join("\n");
  return new Response(md + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      ...draftNoindexHeaders(params.slug),
    },
  });
}
