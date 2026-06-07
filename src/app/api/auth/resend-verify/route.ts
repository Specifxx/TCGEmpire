import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, createAuthToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // One account can only trigger a few verification emails per hour.
  const limit = rateLimit(`resend-verify:${sessionUser.id}`, 4, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const token = await createAuthToken(user.id, "verify");
  await sendVerificationEmail(user.email, token);
  return NextResponse.json({ ok: true });
}
