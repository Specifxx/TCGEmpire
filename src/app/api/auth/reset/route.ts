import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeAuthToken, hashPassword, createSession } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { claimAlertsForUser } from "@/lib/alerts";

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
  // The address comes back from the update rather than the request body — this
  // flow is token-addressed and never carries an email the caller could supply.
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.password), emailVerified: new Date() },
    select: { email: true },
  });
  await createSession(userId); // log them straight in
  // Adopt any price watches this address created before it had an account —
  // fire-and-forget: a failure here must never block signing in.
  void claimAlertsForUser(userId, user.email).catch(() => {});
  return NextResponse.json({ ok: true });
}
