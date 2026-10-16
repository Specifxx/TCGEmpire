import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { parseAffiliateApplication } from "@/lib/creator-affiliate-code";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";

export const dynamic = "force-dynamic";

// The creator code application (/creators/apply, 2026-10-16). Saved to
// AffiliateApplication, which /admin/affiliates reviews, and emailed to the owner
// (notifyOwnerBounded). The /contact route's abuse controls: a hidden honeypot,
// hard length bounds, and a per-IP rate limit. Nothing here is ever published.
export async function POST(req: Request) {
  const rl = rateLimit(`creator-apply:${clientIp(req)}`, 5, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = parseAffiliateApplication(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.spam) return NextResponse.json({ ok: true });

  const d = parsed.data;
  try {
    await prisma.affiliateApplication.create({ data: d });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now — please try again." }, { status: 500 });
  }
  await notifyOwnerBounded({
    kind: "affiliate",
    headline: `${d.name} (${d.platform}) applied for a creator code`,
    from: `${d.name} <${d.email}>`,
    fields: [
      ["Channel", d.channelUrl],
      ["Audience", d.audience],
      ["Code they'd like", d.preferredCode],
    ],
    body: d.message,
  });
  return NextResponse.json({ ok: true });
}
