import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forumSchema, prepareForumData } from "@/lib/forum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const where =
    kind === "WTB" || kind === "WTS" || kind === "DISCUSSION"
      ? { kind, status: "OPEN" }
      : { status: "OPEN" };
  const posts = await prisma.forumPost.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  // Posting requires an account so every listing is tied to a real person.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in to post a listing." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = forumSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  if (parsed.data.website) return NextResponse.json({ ok: true }); // honeypot

  const { fields, items } = await prepareForumData(parsed.data);
  const post = await prisma.forumPost.create({
    data: {
      ...fields,
      items: items.length ? (items as unknown as Prisma.InputJsonValue) : undefined,
      authorName: user.displayName,
      userId: user.id,
    },
  });
  return NextResponse.json({ ok: true, post });
}
