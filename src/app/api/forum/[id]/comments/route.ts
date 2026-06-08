import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { awardPoints } from "@/lib/points";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const comments = await prisma.forumComment.findMany({
    where: { postId: params.id },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  return NextResponse.json({ comments }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  body: z.string().min(1, "Write a comment").max(2000),
  website: z.string().optional(), // honeypot
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in to comment." }, { status: 401 });

  const data = await req.json().catch(() => null);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.website) return NextResponse.json({ ok: true }); // honeypot

  const post = await prisma.forumPost.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const comment = await prisma.forumComment.create({
    data: {
      postId: params.id,
      userId: user.id,
      authorName: user.displayName,
      body: parsed.data.body.trim(),
    },
  });
  // Reward commenting (capped per day inside awardPoints).
  await awardPoints(user.id, "forum_comment").catch(() => {});
  return NextResponse.json({ ok: true, comment });
}
