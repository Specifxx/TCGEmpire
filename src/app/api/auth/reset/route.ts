import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeAuthToken, hashPassword, createSession } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  // Limit reset-token guessing.
  const limit = rateLimit(`reset:ip:${clientIp(req)}`, 15, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const userId = await consumeAuthToken(parsed.data.token, "reset");
  if (!userId) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  // Setting the password proves the user controls the inbox, so verify the email too.
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.password), emailVerified: new Date() },
  });
  await createSession(userId); // log them straight in
  return NextResponse.json({ ok: true });
}
