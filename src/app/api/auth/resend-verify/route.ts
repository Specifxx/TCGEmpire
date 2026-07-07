import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, createAuthToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();

  // Signed-in path — resend to the current account (rate-limited per account).
  if (sessionUser) {
    const limit = rateLimit(`resend-verify:${sessionUser.id}`, 4, 60 * 60_000);
    if (!limit.ok) return tooManyRequests(limit.retryAfter);
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });
    const token = await createAuthToken(user.id, "verify");
    await sendVerificationEmail(user.email, token);
    return NextResponse.json({ ok: true });
  }

  // Unauthenticated path — unverified accounts are blocked at sign-in, so they can't
  // resend from a session. Accept an email, rate-limit hard (per IP + per email), and
  // ALWAYS return a generic ok so this can't enumerate which accounts exist.
  const ipLimit = rateLimit(`resend-verify:ip:${clientIp(req)}`, 6, 60 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);
  const parsed = z.object({ email: z.string().email() }).safeParse(await req.json().catch(() => null));
  if (parsed.success) {
    const email = parsed.data.email.toLowerCase();
    const emailLimit = rateLimit(`resend-verify:email:${email}`, 4, 60 * 60_000);
    if (emailLimit.ok) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailVerified && user.passwordHash) {
        const token = await createAuthToken(user.id, "verify");
        await sendVerificationEmail(user.email, token).catch(() => {});
      }
    }
  }
  return NextResponse.json({ ok: true });
}
