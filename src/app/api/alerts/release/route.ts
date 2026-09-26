import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { setByCode } from "@/lib/constants";
import { RELEASE_ALERT_SOURCES } from "@/lib/release-alerts";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  setCode: z.string().trim().toUpperCase().max(8),
  cardId: z.string().min(1).max(40).optional(),
  market: z.enum(["AU", "US", "UK", "SG", "CA", "EU"]).default("US"),
  source: z.enum(RELEASE_ALERT_SOURCES as unknown as [string, ...string[]]).optional(),
  website: z.string().optional(),
});

// The one-field "email me when {set} lands" signup (lib/release-alerts.ts).
// No account needed, like /api/alerts/subscribe. The only write is the
// visitor's own explicit signup. Idempotent per (email, set, scope).
export async function POST(req: Request) {
  const rl = rateLimit(`alerts:release:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { email, setCode, cardId, market, source, website } = parsed.data;
  if (website) return NextResponse.json({ ok: true }); // honeypot
  const set = setByCode(setCode);
  if (!set?.comingSoon) return NextResponse.json({ error: "Unknown set." }, { status: 400 });

  let scope = "set";
  if (cardId) {
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { setCode: true } });
    if (card?.setCode !== setCode) return NextResponse.json({ error: "Unknown card." }, { status: 400 });
    scope = cardId;
  }

  try {
    // One token per address (the same one on every row), so the email's
    // unsubscribe stops every release alert for that address.
    const existing = await prisma.setReleaseAlert.findFirst({ where: { email }, select: { unsubToken: true } });
    await prisma.setReleaseAlert.upsert({
      where: { email_setCode_scope: { email, setCode, scope } },
      create: { email, setCode, scope, market, source: source ?? null, unsubToken: existing?.unsubToken ?? randomUUID() },
      update: {},
    });
  } catch {
    return NextResponse.json({ error: "Couldn't sign you up right now — please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
