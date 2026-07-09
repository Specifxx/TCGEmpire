import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { sendNewsletterWelcomeEmail } from "@/lib/email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";

const SOURCES = new Set(["footer", "movers", "countdown", "blog", "market"]);
const schema = z.object({
  email: z.string().email().max(200),
  market: z.string().max(2).optional(),
  source: z.string().max(20).optional(),
});

// Newsletter signup. Re-subscribing is idempotent and never errors; only a genuinely
// NEW subscriber gets the welcome email (best-effort). Rate-limited to stop welcome-
// email bombing / junk-row insertion (mirrors /api/alerts/subscribe).
export async function POST(req: Request) {
  const rl = rateLimit(`newsletter:${clientIp(req)}`, 20, 60_000); // 20/min/IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source && SOURCES.has(parsed.data.source) ? parsed.data.source : "footer";
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (!existing) {
      const unsubToken = randomUUID();
      await prisma.newsletterSubscriber.create({
        data: { email, market: parsed.data.market ?? "AU", source, unsubToken },
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
