import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAuthToken } from "@/lib/auth";
import { sendPasswordResetEmail, isEmailEnabled } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  // Stop reset-email bombing: cap per IP and per target email.
  const ipLimit = rateLimit(`forgot:ip:${clientIp(req)}`, 5, 60 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);
  const emailLimit = rateLimit(`forgot:email:${email}`, 3, 60 * 60_000);
  if (!emailLimit.ok) {
    // Still answer ok so we don't leak whether the address is registered.
    return NextResponse.json({ ok: true, emailConfigured: isEmailEnabled() });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Send to any existing account. This doubles as "set a password": a Google/Discord
  // user (or one whose unverified password was cleared on OAuth link) can use it to
  // add password login, since they control this provider-verified inbox. The reset
  // route writes passwordHash regardless of whether one existed.
  // Always respond ok so we never leak which emails are registered.
  if (user) {
    const token = await createAuthToken(user.id, "reset");
    await sendPasswordResetEmail(email, token);
  }
  return NextResponse.json({ ok: true, emailConfigured: isEmailEnabled() });
}
