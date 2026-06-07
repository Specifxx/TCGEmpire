import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SEED_DOMAIN } from "@/lib/forum-seed";

// Admin-only: delete all synthetic forum data created by scripts/seed-forum.ts.
// Only posts authored by the @riftcompare.seed persona accounts are removed
// (their comments cascade-delete via the ForumComment relation); real user
// posts are never touched. The persona accounts themselves are deleted too, so
// the board is returned to a clean slate.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const personas = await prisma.user.findMany({
    where: { email: { endsWith: SEED_DOMAIN } },
    select: { id: true },
  });
  const ids = personas.map((p) => p.id);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, deletedPosts: 0, deletedPersonas: 0 });
  }

  // Comments are removed automatically (ForumComment.post has onDelete: Cascade).
  const posts = await prisma.forumPost.deleteMany({ where: { userId: { in: ids } } });
  const accounts = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({
    ok: true,
    deletedPosts: posts.count,
    deletedPersonas: accounts.count,
  });
}
