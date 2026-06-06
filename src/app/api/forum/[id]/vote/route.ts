import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Reddit-style up/down vote. The client tracks the user's own vote in
// localStorage (so it can toggle and avoid double-counting); the server just
// applies the delta. Anonymous and best-effort — fine for an MVP board.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Client sends the exact delta (-2..2) so toggling an up vote to a down vote
  // moves the score by 2. Clamp to keep a single click from doing more.
  const raw = parseInt(new URL(req.url).searchParams.get("delta") ?? "0", 10);
  const delta = Math.max(-2, Math.min(2, Number.isFinite(raw) ? raw : 0));
  if (delta === 0) {
    const post = await prisma.forumPost.findUnique({ where: { id: params.id }, select: { score: true } });
    return NextResponse.json({ score: post?.score ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const post = await prisma.forumPost.update({
      where: { id: params.id },
      data: { score: { increment: delta } },
      select: { score: true },
    });
    return NextResponse.json({ score: post.score }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
