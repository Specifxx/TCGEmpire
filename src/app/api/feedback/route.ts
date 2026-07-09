import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { grantPremiumMonths, feedbackPremiumActive, FEEDBACK_PREMIUM_MONTHS } from "@/lib/premium";

export const dynamic = "force-dynamic";

// On-site feedback form. Requires a signed-in account. The FIRST feedback a user
// submits earns a Premium grant (FEEDBACK_PREMIUM_MONTHS); further submissions are
// welcome but don't grant again.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to send feedback." }, { status: 401 });

  const rl = rateLimit(`feedback:${user.id}`, 5, 60 * 60_000); // 5/hour/user
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const ratingRaw = Number(body?.rating);
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;

  if (message.length < 10) {
    return NextResponse.json({ error: "Please write a little more (at least 10 characters)." }, { status: 400 });
  }

  try {
    const prior = await prisma.feedback.count({ where: { userId: user.id } });
    await prisma.feedback.create({ data: { userId: user.id, message, rating } });

    // Reward only the first submission, only while the promo is on.
    let granted = false;
    let premiumUntil: Date | null = null;
    if (prior === 0 && feedbackPremiumActive()) {
      premiumUntil = await grantPremiumMonths(user.id, FEEDBACK_PREMIUM_MONTHS);
      granted = !!premiumUntil;
    }
    return NextResponse.json({ ok: true, granted, months: FEEDBACK_PREMIUM_MONTHS, premiumUntil });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now — please try again." }, { status: 500 });
  }
}
