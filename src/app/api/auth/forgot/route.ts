import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAuthToken } from "@/lib/auth";
import { sendPasswordResetEmail, isEmailEnabled } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Only send if the account exists AND has a password (OAuth-only accounts can't
  // reset a password). Always respond ok so we never leak which emails are registered.
  if (user && user.passwordHash) {
    const token = await createAuthToken(user.id, "reset");
    await sendPasswordResetEmail(email, token);
  }
  return NextResponse.json({ ok: true, emailConfigured: isEmailEnabled() });
}
