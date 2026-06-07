import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();

  // Throttle brute force: per IP (credential stuffing) and per email (a targeted
  // single-account attack from many IPs that share an instance).
  const ipLimit = rateLimit(`login:ip:${clientIp(req)}`, 20, 5 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);
  const emailLimit = rateLimit(`login:email:${email}`, 8, 15 * 60_000);
  if (!emailLimit.ok) return tooManyRequests(emailLimit.retryAfter);

  const user = await prisma.user.findUnique({ where: { email } });
  // One generic message for every failure (no account, wrong password, or an
  // OAuth-only account) so an attacker can't enumerate which emails are registered
  // or how they sign in.
  if (!user || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 }
    );
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
