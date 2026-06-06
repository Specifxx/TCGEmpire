import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ForumBoard, type ForumItem, type ForumKind, type ForumPostDTO } from "@/components/ForumBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Riftbound Buy & Sell Forum (Australia)",
  description:
    "Community board for Australian Riftbound TCG players to post want-to-buy (WTB) and want-to-sell (WTS) listings and trade cards directly.",
  alternates: { canonical: "/forum" },
};

export default async function ForumPage() {
  const [rows, user] = await Promise.all([
    prisma.forumPost.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { _count: { select: { comments: true } } },
    }),
    getCurrentUser(),
  ]);

  const posts: ForumPostDTO[] = rows.map((p) => ({
    id: p.id,
    kind: p.kind as ForumKind,
    title: p.title,
    cardName: p.cardName,
    setCode: p.setCode,
    condition: p.condition,
    priceCents: p.priceCents,
    items: (p.items as ForumItem[] | null) ?? null,
    marketCents: p.marketCents,
    body: p.body,
    contact: p.contact,
    country: p.country,
    state: p.state,
    authorName: p.authorName,
    userId: p.userId,
    commentCount: p._count.comments,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <ForumBoard
      initialPosts={posts}
      currentUser={user ? { id: user.id, name: user.displayName, isAdmin: user.isAdmin } : null}
    />
  );
}
