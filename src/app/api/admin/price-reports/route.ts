import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { REPORT_STATUSES, type ReportStatus } from "@/lib/price-report";

export const dynamic = "force-dynamic";

// Admin-only triage for wrong-price reports. Same dual gate as every other admin
// mutation (logged-in admin OR ADMIN_TOKEN via ?key=) — mirrors
// /api/admin/feedback, which this is modelled on.
//
// STATUS IS THE WHOLE POINT of this route. A report's value is not the row, it is
// whether someone checked it: CONFIRMED means the store really did disagree with
// us, REJECTED means our number was right, FIXED means the underlying data has
// been corrected. Without that, the queue is just a pile that grows, and the
// per-store rollup on /admin/messages — the thing that actually catches a broken
// scraper — cannot tell a store with five real faults from one with five
// mistaken reports.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const action = body?.action;

  try {
    if (action === "delete") {
      await prisma.priceReport.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    // Validated against the shared list rather than an inline union, so the
    // status set cannot drift from what the admin UI renders chips for.
    if (typeof action === "string" && (REPORT_STATUSES as readonly string[]).includes(action)) {
      await prisma.priceReport.update({ where: { id }, data: { status: action as ReportStatus } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
