import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, createAuthToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const token = await createAuthToken(user.id, "verify");
  await sendVerificationEmail(user.email, token);
  return NextResponse.json({ ok: true });
}
