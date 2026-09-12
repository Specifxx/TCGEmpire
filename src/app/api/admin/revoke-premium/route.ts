import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin-only manual REVOKE — the other half of /api/admin/grant-premium, and
// the in-app version of scripts/revoke-premium.ts. Clears premiumUntil so the
// account drops to the free tier immediately.
//
// THREE THINGS IT DELIBERATELY DOES NOT TOUCH, each because doing so would be
// a bigger change than the one being asked for (the script's header makes the
// same three points at length):
//
//   • isAdmin — isPremium() returns true for any admin regardless of
//     premiumUntil, so an ADMIN ACCOUNT STAYS PREMIUM after this runs. Silently
//     dropping someone's admin rights to satisfy "remove premium" would be a
//     far larger action, so it's reported back instead and left alone.
//   • trialStartedAt — one free trial per account. Clearing it hands out a
//     second free trial, which is a different request.
//   • the Stripe subscription — if one is still ACTIVE, its next webhook
//     re-stamps premiumUntil and Premium returns on its own. Reported back so
//     that surprise is visible up front rather than discovered later.
//
// premiumTier is left as-is too: it only means anything while premiumUntil is
// in the future, and the next grant sets it fresh (see grantPremiumDays).
//
// Same dual gate as every other admin mutation (logged-in admin OR ADMIN_TOKEN
// via body.key).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, premiumUntil: true, premiumTier: true, isAdmin: true, stripeCustomerId: true },
  });
  if (!user) return NextResponse.json({ error: "No account with that email" }, { status: 404 });

  await prisma.user.update({
    where: { id: user.id },
    data: { premiumUntil: null, earlyPremiumGranted: false },
  });

  // An entitlement change by hand must be traceable in the function logs —
  // same rule the grant route follows.
  console.log(
    `admin revoke-premium: ${user.email} by ${me?.email ?? "ADMIN_TOKEN"} — premiumUntil ${user.premiumUntil?.toISOString() ?? "none"} (${user.premiumTier}) → null`
  );

  return NextResponse.json({
    ok: true,
    email: user.email,
    was: user.premiumUntil?.toISOString() ?? null,
    wasTier: user.premiumTier,
    // Both of these mean "this account may still read as Premium" — surfaced so
    // the admin isn't left wondering why nothing appeared to change.
    stillAdmin: user.isAdmin,
    hasStripeCustomer: !!user.stripeCustomerId,
  });
}
