import { draftNoindexHeaders, getArticle } from "@/lib/articles";
import { SITE_URL } from "@/lib/site";

// Clean markdown version of a GUIDE for AI agents — the counterpart to
// /llm/blog/[slug], which resolves through getBlogPost() and therefore 404s on
// every guide. Guides are the site's longest-form, most citation-worthy pages,
// so they were exactly the wrong half of the corpus to leave without a
// machine-readable mirror. Discoverable via the `text/markdown` rel=alternate on
// /guides/[slug] and via /llms.txt.
//
// A day, like /guides/[slug] (ten minutes until 2026-10-14, DECISIONS.md,
// "Cached pages refresh every 6 to 24 hours", 2026-10-14). A plain function on
// Vercel (no generateStaticParams), so the CDN header on the answer is its
// cache; see /llm/blog/[slug].
export const revalidate = 86400;

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
  return new Response(md + "\n", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      ...draftNoindexHeaders(post.slug),
    },
  });
}
