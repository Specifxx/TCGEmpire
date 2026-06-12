import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const schema = z.object({ email: z.string().email().max(200), market: z.string().max(2).optional() });

// Footer newsletter signup. Upsert = re-subscribing is idempotent, never errors.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  try {
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, market: parsed.data.market ?? "AU" },
      update: {},
    });
  } catch (e) {
    console.error("newsletter subscribe failed:", e);
    return NextResponse.json({ error: "Try again shortly" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
