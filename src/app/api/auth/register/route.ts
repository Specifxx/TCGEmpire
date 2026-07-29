import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createAuthToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { applyReferral } from "@/lib/referral";
import { grantEarlyAdopterPremium, EARLY_PREMIUM_DAYS } from "@/lib/premium";
import { sendEarlyAdopterEmail } from "@/lib/email";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(24, "Display name is too long"),
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
    },
  });

  // NOTE: no session is created here — the account must verify its email before it
  // can sign in (see the login route). Referral credit still applies.
  // Credit a referrer if they arrived via a /?ref=<userId> link (best-effort).
  await applyReferral(user.id);
  // Early-adopter promo: the first EARLY_PREMIUM_LIMIT accounts get free Premium
  // (best-effort) — and an email telling them it's live (only when the grant
  // actually happened, so the next user in line never gets a false promise).
  // Signup paths only; the backfill script stays silent so existing users aren't
  // mass-emailed by a re-run.
  const granted = await grantEarlyAdopterPremium(user.id).catch(() => false);
  if (granted) await sendEarlyAdopterEmail(email, EARLY_PREMIUM_DAYS).catch(() => {});
  // Send the verification email — the link activates the account for sign-in.
  try {
    const token = await createAuthToken(user.id, "verify");
    await sendVerificationEmail(email, token);
  } catch (e) {
    console.warn("verification email failed:", e);
  }
  return NextResponse.json({ ok: true, verify: true });
}
