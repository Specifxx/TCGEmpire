import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const rec = await prisma.passwordResetToken.findUnique({ where: { token: parsed.data.token } });
  if (!rec || rec.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: rec.userId },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: rec.userId } });

  return NextResponse.json({ ok: true });
}
