import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { consumeAuthToken, hashPassword, createSession } from "@/lib/auth";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const userId = await consumeAuthToken(parsed.data.token, "reset");
  if (!userId) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }
  // Setting the password proves the user controls the inbox, so verify the email too.
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.password), emailVerified: new Date() },
  });
  await createSession(userId); // log them straight in
  return NextResponse.json({ ok: true });
}
