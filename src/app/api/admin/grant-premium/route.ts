import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { grantPremiumDays } from "@/lib/premium";

export const dynamic = "force-dynamic";

// Admin-only manual Premium grant — the remediation lever the Naron incident
// (Aug 2026) showed was missing: a paying customer stood lapsed and the only
// writers of premiumUntil were Stripe webhooks, so there was no way to make a
// stranded account whole without a production DB console. Grants STACK onto any
// current entitlement (grantPremiumDays extends from max(now, premiumUntil)),
// and the Stripe paths are extend-only, so a grant can never be clobbered by
// the next renewal event.
//
// Same dual gate as the other admin mutations (logged-in admin OR ADMIN_TOKEN
// via body.key) — see /api/admin/feedback, which this mirrors.
const MAX_DAYS = 1830; // 5 years — a typo guard, not a policy statement.

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const days = Math.floor(Number(body?.days));
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return NextResponse.json({ error: `days must be 1–${MAX_DAYS}` }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, premiumUntil: true },
  });
  if (!user) return NextResponse.json({ error: "No account with that email" }, { status: 404 });

  const until = await grantPremiumDays(user.id, days);
  if (!until) return NextResponse.json({ error: "Grant failed" }, { status: 500 });

  // An entitlement change by hand must be traceable in the function logs.
  console.log(
    `admin grant-premium: ${days}d to ${user.email} by ${me?.email ?? "ADMIN_TOKEN"} — premiumUntil ${user.premiumUntil?.toISOString() ?? "none"} → ${until.toISOString()}`
  );
  return NextResponse.json({ ok: true, email: user.email, premiumUntil: until.toISOString() });
}
