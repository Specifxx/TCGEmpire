// The beta forum (docs/forum.md). Threads are in the HTML from the page's cached
// copy of forum.json (six hours, like every page buyers act on); the browser then
// fetches the newest copy from GitHub itself. No database read.
import type { Metadata } from "next";
import { ForumApp } from "@/components/forum/Forum";
import "@/components/forum/forum.css";
import { forumIndexable } from "@/lib/forum/core";
import { FORUM_SITE } from "@/lib/forum/site";
import { readForum } from "@/lib/forum/store";

export const revalidate = 21600;

export async function generateMetadata(): Promise<Metadata> {
  const forum = await readForum(FORUM_SITE, revalidate);
  return {
    title: "Riftbound Forum: Prices, Deals and Collections",
    description: "The RiftCompare community forum. Talk Riftbound card prices, deals, decks and collections. No account needed.",
    alternates: { canonical: "/forum" },
    ...(forumIndexable(forum) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ForumPage() {
  const forum = await readForum(FORUM_SITE, revalidate);
  return (
    <div className="mx-auto max-w-6xl">
      <ForumApp site={FORUM_SITE} initial={forum} now={Date.now()} />
    </div>
  );
}
