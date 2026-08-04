import { getArticle } from "@/lib/articles";
import { SITE_URL } from "@/lib/site";

// Clean markdown version of a GUIDE for AI agents — the counterpart to
// /llm/blog/[slug], which resolves through getBlogPost() and therefore 404s on
// every guide. Guides are the site's longest-form, most citation-worthy pages,
// so they were exactly the wrong half of the corpus to leave without a
// machine-readable mirror. Discoverable via the `text/markdown` rel=alternate on
// /guides/[slug] and via /llms.txt.
export const revalidate = 600;

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const post = getArticle(params.slug);
  if (!post || post.category !== "guide") {
    return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  }

  const md = [
    `# ${post.title}`,
    "",
    `_${post.date}${post.updated && post.updated !== post.date ? ` (updated ${post.updated})` : ""} · ${post.author}_`,
    "",
    post.excerpt,
    "",
    ...(post.summary?.length ? ["## The short version", "", ...post.summary.map((s) => `- ${s}`), ""] : []),
    post.body,
    "",
    ...(post.faq?.length ? ["## FAQ", "", ...post.faq.flatMap((f) => [`**${f.q}**`, "", f.a, ""])] : []),
    `Source: ${SITE_URL}/guides/${post.slug}`,
  ].join("\n");
  return new Response(md + "\n", { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
