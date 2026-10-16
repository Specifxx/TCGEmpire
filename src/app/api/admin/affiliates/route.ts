import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setAffiliateActive, syncAffiliatePromotionCode } from "@/lib/creator-affiliate";
import { normaliseAffiliateCode } from "@/lib/creator-affiliate-code";

export const dynamic = "force-dynamic";

// Admin-only actions for /admin/affiliates (2026-10-16). Same dual gate as the
// other admin mutations (logged-in admin OR ADMIN_TOKEN as the body's key), and
// a 404 for anyone else so the route does not advertise itself.
//   approve  {applicationId, code}   → an Affiliate + its Stripe promotion code
//   create   {name, email, code}     → the same, without an application
//   reject   {applicationId}
//   active   {affiliateId, active}   → switch a code on or off (site and Stripe)
//   sync     {affiliateId}           → retry the Stripe promotion code
//   paid     {affiliateId}           → mark every unpaid commission paid
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  const str = (k: string) => (typeof body?.[k] === "string" ? (body[k] as string).trim() : "");

  // A Stripe failure never undoes the database write: the code works on our
  // checkout either way (it falls back to the shared coupon), and "sync" retries.
  const withStripe = async (affiliateId: string) => {
    try {
      await syncAffiliatePromotionCode(affiliateId);
      return { ok: true as const };
    } catch (e) {
      console.error("[affiliate] Stripe promotion code not created:", e);
      return { ok: true as const, warning: `Saved, but Stripe said: ${(e as Error).message}. Press "Sync with Stripe" to retry.` };
    }
  };

  switch (body?.action) {
    case "approve":
    case "create": {
      const code = normaliseAffiliateCode(str("code"));
      if (!code) return NextResponse.json({ error: "A code is 3 to 20 letters or numbers." }, { status: 400 });
      if (await prisma.affiliate.findUnique({ where: { code }, select: { id: true } })) {
        return NextResponse.json({ error: `${code} is already taken.` }, { status: 409 });
      }
      let name = str("name");
      let email = str("email").toLowerCase();
      const applicationId = body.action === "approve" ? str("applicationId") : "";
      if (applicationId) {
        const app = await prisma.affiliateApplication.findUnique({ where: { id: applicationId }, select: { name: true, email: true, status: true } });
        if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });
        if (app.status === "approved") return NextResponse.json({ error: "Already approved" }, { status: 409 });
        name = app.name;
        email = app.email;
      }
      if (!name || !email) return NextResponse.json({ error: "Name and email are needed." }, { status: 400 });
      const a = await prisma.affiliate.create({ data: { name, email, code }, select: { id: true } });
      if (applicationId) {
        await prisma.affiliateApplication.update({ where: { id: applicationId }, data: { status: "approved", affiliateId: a.id, reviewedAt: new Date() } });
      }
      return NextResponse.json(await withStripe(a.id));
    }
    case "reject": {
      const id = str("applicationId");
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      await prisma.affiliateApplication.updateMany({ where: { id, status: "pending" }, data: { status: "rejected", reviewedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }
    case "active": {
      const id = str("affiliateId");
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      try {
        await setAffiliateActive(id, body.active === true);
      } catch (e) {
        return NextResponse.json({ error: `Saved here, but Stripe said: ${(e as Error).message}` }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }
    case "sync": {
      const id = str("affiliateId");
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      return NextResponse.json(await withStripe(id));
    }
    case "paid": {
      const id = str("affiliateId");
      if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const r = await prisma.affiliateCommission.updateMany({ where: { affiliateId: id, paidOut: false }, data: { paidOut: true, paidOutAt: new Date() } });
      return NextResponse.json({ ok: true, marked: r.count });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
