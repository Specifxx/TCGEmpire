import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { sendStoreReportEmail } from "@/lib/store-plan-db";

export const dynamic = "force-dynamic";

// Admin-only management of B2B repricer partners. POST creates a partner and
// returns the capability URL to send the store; GET lists partners (with links).
//
// DUAL GATE, added 2026-09-21. Both handlers used to accept a logged-in admin
// ONLY, while every /admin PAGE also accepts ?key=ADMIN_TOKEN. That mismatch was
// invisible while nothing called this route — there was no UI at all — and would
// have broken the moment one existed, because a form on a page reached by
// ADMIN_TOKEN would 403 against its own API. Same shape as /api/admin/tier-floor.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && new URL(req.url).searchParams.get("key") === token;
  if (!(keyOk || user?.isAdmin)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const partners = await prisma.storePartner.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    partners: partners.map((p) => ({ ...p, reportUrl: `${SITE_URL}/stores/report?token=${p.token}` })),
  });
}

const schema = z.object({
  retailer: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  key: z.string().optional(),
  // Linking a paid Stores plan (lib/store-plan.ts) to the tracked store it is:
  // the StorePlanSubscription id from the "waiting to be linked" list.
  planSubscriptionId: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = await getCurrentUser();
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  if (!(keyOk || user?.isAdmin)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "retailer + name required" }, { status: 400 });

  // Sanity: the retailer key should actually exist in the price data.
  const rows = await prisma.retailerPrice.count({ where: { retailer: parsed.data.retailer } });
  if (rows === 0) {
    return NextResponse.json({ error: `No price rows found for retailer key "${parsed.data.retailer}"` }, { status: 400 });
  }

  if (parsed.data.planSubscriptionId) return linkPlan(parsed.data.planSubscriptionId, parsed.data.retailer, parsed.data.name);

  // `key` is an auth field, not partner data — spreading parsed.data wholesale
  // would try to write it as a column.
  const partner = await prisma.storePartner.create({
    data: {
      retailer: parsed.data.retailer,
      name: parsed.data.name,
      token: randomBytes(24).toString("base64url"),
    },
  });
  return NextResponse.json({ ok: true, reportUrl: `${SITE_URL}/stores/report?token=${partner.token}` });
}

// A paid Stores plan → its partner row. One transaction creates the partner
// (carrying the plan) and marks the plan linked, so a double click cannot make
// two report links for one subscription (both columns are @unique). Then the
// buyer is emailed the link; if that email fails the link is still returned
// here to send by hand.
async function linkPlan(planSubscriptionId: string, retailer: string, name: string) {
  const plan = await prisma.storePlanSubscription.findUnique({
    where: { id: planSubscriptionId },
    select: { id: true, userId: true, partnerId: true, storeName: true },
  });
  if (!plan) return NextResponse.json({ error: "No such Stores plan" }, { status: 404 });
  if (plan.partnerId) return NextResponse.json({ error: "That plan is already linked to a store" }, { status: 409 });

  let partner: { id: string; token: string };
  try {
    partner = await prisma.$transaction(async (tx) => {
      const p = await tx.storePartner.create({
        data: { retailer, name, token: randomBytes(24).toString("base64url"), planSubscriptionId: plan.id },
        select: { id: true, token: true },
      });
      const claimed = await tx.storePlanSubscription.updateMany({ where: { id: plan.id, partnerId: null }, data: { partnerId: p.id } });
      if (claimed.count !== 1) throw new Error("already linked");
      return p;
    });
  } catch (e) {
    console.error(`admin store-partners: linking plan ${plan.id} failed:`, e);
    return NextResponse.json({ error: "That plan is already linked to a store" }, { status: 409 });
  }

  const reportUrl = `${SITE_URL}/stores/report?token=${partner.token}`;
  const buyer = await prisma.user.findUnique({ where: { id: plan.userId }, select: { email: true } });
  const emailed = buyer?.email ? await sendStoreReportEmail(buyer.email, name, reportUrl) : false;
  return NextResponse.json({ ok: true, reportUrl, emailed, emailedTo: emailed ? buyer?.email : null });
}
