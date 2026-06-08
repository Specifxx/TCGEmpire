import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { SEED_DOMAIN } from "@/lib/forum-seed";
import { ForumBoard, type ForumItem, type ForumKind, type ForumPostDTO } from "@/components/ForumBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Riftbound Buy & Sell Forum — RiftCompare",
  description:
    "Community board for Riftbound TCG players to post want-to-buy (WTB) and want-to-sell (WTS) listings and trade cards directly with others in your country.",
  alternates: { canonical: "/forum" },
};

const ADMIN_MARKETS = ["AU", "NZ", "US", "ALL"] as const;
type AdminMarket = (typeof ADMIN_MARKETS)[number];

export default async function ForumPage({
  searchParams,
}: {
  searchParams?: { market?: string };
}) {
  const user = await getCurrentUser();
  const isAdmin = !!user?.isAdmin;

  // Regular visitors always see their own market. Admins may override it with
  // ?market=AU|NZ|US|ALL to inspect listings in any region from one place.
  const requested = (searchParams?.market ?? "").toUpperCase();
  const adminMarket: AdminMarket | null =
    isAdmin && (ADMIN_MARKETS as readonly string[]).includes(requested)
      ? (requested as AdminMarket)
      : null;
  const viewMarket = adminMarket ?? getCountry();

  const statusWhere = { status: { in: ["OPEN", "SOLD"] } };
  // "ALL" (admin-only) drops the market filter so every region shows together.
  const where = viewMarket === "ALL" ? statusWhere : { ...statusWhere, market: viewMarket };

  // Show open listings plus already-sold ones: a board full of completed sales
  // signals an active, trusted marketplace to newcomers.
  const rows = await prisma.forumPost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 400,
    include: { _count: { select: { comments: true } } },
  });

  // Per-region counts and the synthetic-data count power the admin control bar.
  let adminView: {
    market: AdminMarket;
    counts: { AU: number; NZ: number; US: number; total: number };
    seedCount: number;
  } | null = null;
  if (isAdmin) {
    const [grouped, seedPersonas] = await Promise.all([
      prisma.forumPost.groupBy({ by: ["market"], where: statusWhere, _count: { _all: true } }),
      prisma.user.findMany({ where: { email: { endsWith: SEED_DOMAIN } }, select: { id: true } }),
    ]);
    const byMarket = (m: string) => grouped.find((g) => g.market === m)?._count._all ?? 0;
    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    const seedIds = seedPersonas.map((p) => p.id);
    const seedCount = seedIds.length
      ? await prisma.forumPost.count({ where: { userId: { in: seedIds } } })
      : 0;
    adminView = {
      market: adminMarket ?? (viewMarket as AdminMarket),
      counts: { AU: byMarket("AU"), NZ: byMarket("NZ"), US: byMarket("US"), total },
      seedCount,
    };
  }

  const posts: ForumPostDTO[] = rows.map((p) => ({
    id: p.id,
    kind: p.kind as ForumKind,
    status: p.status === "SOLD" ? "SOLD" : "OPEN",
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
    market: p.market,
    authorName: p.authorName,
    userId: p.userId,
    commentCount: p._count.comments,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <ForumBoard
      initialPosts={posts}
      currentUser={user ? { id: user.id, name: user.displayName, isAdmin: user.isAdmin, emailVerified: user.emailVerified } : null}
      adminView={adminView}
    />
  );
}
