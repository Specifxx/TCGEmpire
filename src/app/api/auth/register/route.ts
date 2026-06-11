import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, hashPassword, createAuthToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { awardPoints } from "@/lib/points";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(24, "Display name is too long"),
  // Opt-in (default off) for leaderboard emails — captured with consent at signup,
  // honoured only via a real unsubscribe. Never a default-on / unsolicited send.
  leaderboardEmails: z.boolean().optional(),
});

export async function POST(req: Request) {
  // Cap new accounts (and the verification emails they trigger) per IP.
  const limit = rateLimit(`register:ip:${clientIp(req)}`, 5, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      displayName: parsed.data.displayName,
      passwordHash: await hashPassword(parsed.data.password),
      leaderboardEmails: parsed.data.leaderboardEmails ?? false,
    },
  });

  await createSession(user.id);
  // Welcome Shards — seeds the loyalty economy the moment they join.
  await awardPoints(user.id, "welcome").catch(() => {});
  // Send a confirmation email (best-effort; no-op until RESEND_API_KEY is set).
  try {
    const token = await createAuthToken(user.id, "verify");
    await sendVerificationEmail(email, token);
  } catch (e) {
    console.warn("verification email failed:", e);
  }
  return NextResponse.json({ ok: true });
}
