import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeAuthToken } from "@/lib/auth";
import { awardPoints } from "@/lib/points";

const schema = z.object({ token: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const userId = await consumeAuthToken(parsed.data.token, "verify");
  if (!userId) {
    return NextResponse.json({ error: "This confirmation link is invalid or has expired." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  // One-time Shard reward for confirming the email.
  await awardPoints(userId, "verify_email").catch(() => {});
  return NextResponse.json({ ok: true });
}
