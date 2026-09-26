import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { parseContactMessage } from "@/lib/contact-message";

export const dynamic = "force-dynamic";

// The /contact form. Writes ContactMessage, which /admin/messages reads — the
// table existed and the admin section existed, but no form ever wrote it
// (2026-09-26). Same abuse controls as /api/price-report, the inbox form that
// demonstrably works: a display:none honeypot, hard length bounds, and a per-IP
// rate limit sized to bound flooding. Nothing here is ever published.
export async function POST(req: Request) {
  const rl = rateLimit(`contact:${clientIp(req)}`, 6, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = parseContactMessage(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.spam) return NextResponse.json({ ok: true });

  try {
    await prisma.contactMessage.create({ data: parsed.data });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now — please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
