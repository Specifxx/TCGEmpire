import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

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
  const user = await prisma.user.findUnique({ where: { email } });
  // Account created via Google/Discord has no password — point them to that.
  if (user && !user.passwordHash) {
    return NextResponse.json(
      { error: "This account uses Google or Discord sign-in — use that button above." },
      { status: 401 }
    );
  }
  if (!user || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Incorrect email or password" },
      { status: 401 }
    );
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
