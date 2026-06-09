import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Toggle a forum listing's SOLD status. Author (or admin) only.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const post = await prisma.forumPost.findUnique({ where: { id: params.id }, select: { userId: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.userId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "You can only update your own posts." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sold = !!body?.sold;
  await prisma.forumPost.update({ where: { id: params.id }, data: { status: sold ? "SOLD" : "OPEN" } });
  return NextResponse.json({ ok: true, status: sold ? "SOLD" : "OPEN" });
}
