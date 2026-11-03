// One forum thread (docs/forum.md). A thread with no replies is noindex. A
// thread newer than the page's cached copy is drawn by the browser (noindex).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForumApp } from "@/components/forum/Forum";
import "@/components/forum/forum.css";
import { findThread, idFromSegment, threadDescription, threadIndexable, threadJsonLd, threadPath } from "@/lib/forum/core";
import { FORUM_SITE } from "@/lib/forum/site";
import { readForum } from "@/lib/forum/store";
import { SITE_URL } from "@/lib/site";

export const revalidate = 21600;
// Drawn on first visit, never at build.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: { thread: string } }): Promise<Metadata> {
  const id = idFromSegment(params.thread);
  const t = id ? findThread(await readForum(FORUM_SITE, revalidate), id) : null;
  if (!t) return { title: "Riftbound Forum", robots: { index: false, follow: true } };
  return {
    title: `${t.title} | Riftbound Forum`,
    description: threadDescription(t),
    alternates: { canonical: threadPath(FORUM_SITE, t) },
    ...(threadIndexable(t) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ThreadPage({ params }: { params: { thread: string } }) {
  const id = idFromSegment(params.thread);
  if (!id) notFound();
  const forum = await readForum(FORUM_SITE, revalidate);
  const t = findThread(forum, id);
  return (
    <div className="mx-auto max-w-6xl">
      {t && threadIndexable(t) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(threadJsonLd(SITE_URL, FORUM_SITE, t)).replace(/</g, "\\u003c") }} />}
      <ForumApp site={FORUM_SITE} initial={forum} threadId={id} now={Date.now()} />
    </div>
  );
}
