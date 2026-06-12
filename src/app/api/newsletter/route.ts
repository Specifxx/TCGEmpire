import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { sendNewsletterWelcomeEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

const schema = z.object({ email: z.string().email().max(200), market: z.string().max(2).optional() });

// Footer newsletter signup. Re-subscribing is idempotent and never errors; only
// a genuinely NEW subscriber gets the welcome email (best-effort — signup still
// succeeds if email is down or unconfigured).
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (!existing) {
      const unsubToken = randomUUID();
      await prisma.newsletterSubscriber.create({
        data: { email, market: parsed.data.market ?? "AU", unsubToken },
      });
      await sendNewsletterWelcomeEmail(
        email,
        `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(unsubToken)}`
      ).catch(() => {});
    }
  } catch (e) {
    // Unique-violation race from a double-click = already subscribed = success.
    const code = (e as { code?: string })?.code;
    if (code !== "P2002") {
      console.error("newsletter subscribe failed:", e);
      return NextResponse.json({ error: "Try again shortly" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
