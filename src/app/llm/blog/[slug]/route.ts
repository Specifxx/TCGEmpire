import { draftNoindexHeaders } from "@/lib/articles";
import { getBlogPost } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";

// Clean markdown version of a blog post / daily market report for AI agents. The
// posts are already authored in markdown (Article.body), so this serves them raw.
export const revalidate = 600;

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
    headers: { "Content-Type": "text/markdown; charset=utf-8", ...draftNoindexHeaders(params.slug) },
  });
}
