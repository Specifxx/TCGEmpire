import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forumSchema, prepareForumData } from "@/lib/forum";

export const dynamic = "force-dynamic";

// Delete a post. Allowed for the post's owner, or a moderator (admin).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const post = await prisma.forumPost.findUnique({ where: { id: params.id }, select: { userId: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.userId !== user.id && !user.isAdmin) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  await prisma.forumPost.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

// Edit a post — owner only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const post = await prisma.forumPost.findUnique({ where: { id: params.id }, select: { userId: true } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.userId !== user.id) {
    return NextResponse.json({ error: "You can only edit your own posts." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = forumSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { fields, items } = await prepareForumData(parsed.data);
  const updated = await prisma.forumPost.update({
    where: { id: params.id },
    data: { ...fields, items: items.length ? (items as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
  });
  return NextResponse.json({ ok: true, post: updated });
}
