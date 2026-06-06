import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().email("Enter a valid email") });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    const token = randomBytes(32).toString("hex");
    // One active reset token per user.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }, // 1 hour
    });
    const link = `${SITE_URL}/reset-password?token=${token}`;
    await sendEmail(
      email,
      `Reset your ${SITE_NAME} password`,
      `<p>We received a request to reset your ${SITE_NAME} password.</p>
       <p><a href="${link}">Click here to choose a new password</a> (this link expires in 1 hour).</p>
       <p>If you didn't request this, you can safely ignore this email.</p>`
    );
  }

  // Always return success — never reveal whether an account exists.
  return NextResponse.json({ ok: true });
}
