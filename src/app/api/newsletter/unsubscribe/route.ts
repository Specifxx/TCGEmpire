import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

// Token-addressed newsletter unsubscribe, mirroring /api/alerts/unsubscribe:
// GET looks up what the token covers (so the page can confirm), POST removes
// the subscriber. POST-to-confirm keeps inbox link-prefetchers from
// unsubscribing people by accident.

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ active: false });
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubToken: token } });
  return NextResponse.json(sub ? { active: true, email: sub.email } : { active: false });
}

const schema = z.object({ token: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const { count } = await prisma.newsletterSubscriber.deleteMany({
    where: { unsubToken: parsed.data.token },
  });
  return NextResponse.json({ ok: true, removed: count });
}
