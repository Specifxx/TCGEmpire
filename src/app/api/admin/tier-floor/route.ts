import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Set (or clear) User.premiumTierFloor for one or more accounts.
//
// WHY THIS EXISTS. Tier is resolved from the live Stripe price id, which is
// correct for everyone whose price means exactly one thing. It stopped being
// correct the moment the August $4.99 Price object became the PLUS price:
// the people who subscribed at $4.99 back when it was the only plan were
// promised their price would hold, and that promise was about the price, not
// about a reduced feature set that didn't exist yet. They now share a price id
// with genuine new Plus customers, so no rule derived from the price alone can
// tell the two cohorts apart. The difference is a fact about the CUSTOMER, so
// it is stored on the customer.
//
// A FLOOR, NOT AN OVERWRITE. Billing keeps writing the true tier to
// premiumTier; the floor is applied at read time (see effectiveTier). That
// means a renewal, a plan change, the nightly reconcile or the audit script
// can all re-stamp the billing tier as often as they like without disturbing
// the promise, and nothing has to be re-pinned afterwards. It also means the
// floor can only ever RAISE someone: an account that genuinely upgrades past
// its floor keeps the higher tier, and no floor can strand an account below
// what it pays for.
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

  // Accepts one email or many — the grandfathering case is inherently a batch
  // (a whole pricing cohort), and doing it one account at a time invites
  // missing one.
  const raw = typeof body?.emails === "string" ? body.emails : typeof body?.email === "string" ? body.email : "";
  const emails = raw
    .split(/[\s,;]+/)
    .map((e: string) => e.trim())
    .filter(Boolean);
  if (!emails.length) return NextResponse.json({ error: "No emails given" }, { status: 400 });

  // null clears the floor. Anything else must be a real tier — never trust the
  // body to name a tier that doesn't exist.
  const floor = body?.floor === null || body?.floor === "" ? null : body?.floor;
  if (floor !== null && floor !== "plus" && floor !== "premium") {
    return NextResponse.json({ error: 'floor must be "plus", "premium" or null' }, { status: 400 });
  }

  const results: { email: string; ok: boolean; was?: string | null; tier?: string; note?: string }[] = [];
  for (const email of emails) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, premiumTier: true, premiumTierFloor: true, premiumUntil: true },
    });
    if (!user) {
      results.push({ email, ok: false, note: "no account with that email" });
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { premiumTierFloor: floor } });
    console.log(
      `admin tier-floor: ${user.email} by ${me?.email ?? "ADMIN_TOKEN"} — floor ${user.premiumTierFloor ?? "none"} → ${floor ?? "none"} (billing tier ${user.premiumTier})`,
    );
    results.push({
      email: user.email,
      ok: true,
      was: user.premiumTierFloor,
      tier: user.premiumTier,
      // A floor raises an ACTIVE entitlement; it never creates one. Say so
      // rather than letting an admin think a lapsed account was just fixed.
      note:
        user.premiumUntil && user.premiumUntil > new Date()
          ? undefined
          : "no active entitlement — the floor does nothing until this account is subscribed again",
    });
  }

  return NextResponse.json({ ok: true, floor, results });
}
