import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { cardHref } from "@/lib/card-url";
import { SETS } from "@/lib/constants";
import { getLastEmailError, isEmailEnabled, sendPriceReportFixedEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { REPORT_STATUSES, sealedReportTarget, shouldNotifyReporter, type ReportStatus } from "@/lib/price-report";

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
//
// FIXED ALSO THANKS THE REPORTER (2026-09-23), by email, once — see
// shouldNotifyReporter for why only that transition. The email is a courtesy
// riding on the status change, never a condition of it: a send that throws or a
// provider that refuses is logged and the triage still succeeds.
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
      const next = action as ReportStatus;
      // Read first: whether to email depends on the status being LEFT, and the
      // email needs who filed it and about what.
      const report = await prisma.priceReport.findUnique({
        where: { id },
        select: {
          status: true,
          email: true,
          userId: true,
          retailerName: true,
          kind: true,
          cardId: true,
          sealedGroupKey: true,
          country: true,
        },
      });
      if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

      if (!shouldNotifyReporter(report.status as ReportStatus, next)) {
        await prisma.priceReport.update({ where: { id }, data: { status: next } });
        return NextResponse.json({ ok: true });
      }

      // Scoped to `not FIXED`, the same shape as the consult webhook's
      // `status: { not: "paid" }`: of two clicks racing from two admin tabs, only
      // the one that actually flips the row sends, so a report is one email.
      const flipped = await prisma.priceReport.updateMany({
        where: { id, status: { not: "FIXED" } },
        data: { status: next },
      });
      if (flipped.count > 0) {
        try {
          await thankReporter(id, report);
        } catch (e) {
          console.error(`[price-report] ${id}: fixed-report email failed —`, e);
        }
      }
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

type FixedReport = {
  email: string | null;
  userId: string | null;
  retailerName: string;
  kind: string;
  cardId: string | null;
  sealedGroupKey: string | null;
  country: string;
};

// The "it's fixed" email. Every early return is a report with nobody to tell or
// nothing to link to, which is a normal outcome, not an error. Logs never carry
// the recipient's address — these lines land in the Vercel function logs.
async function thankReporter(id: string, report: FixedReport): Promise<void> {
  if (!isEmailEnabled()) {
    console.log(`[price-report] ${id}: marked FIXED — email is not configured, thank-you skipped.`);
    return;
  }
  const to = await reporterAddress(report);
  if (!to) return;
  const item = await reportedItem(report);
  if (!item) {
    console.warn(`[price-report] ${id}: the reported ${report.kind} no longer resolves — thank-you skipped.`);
    return;
  }
  const sent = await sendPriceReportFixedEmail(to, {
    itemName: item.name,
    retailerName: report.retailerName,
    url: item.url,
  });
  if (!sent) console.warn(`[price-report] ${id}: thank-you not sent — ${getLastEmailError() ?? "unknown error"}`);
}

// The address the reporter volunteered, else their account's — but only a
// VERIFIED one. api/price-report stores `email` for signed-out reporters only;
// for a signed-in one it is null and the account is the address. An unverified
// account email is an address nobody has proven they own, and a stranger's
// inbox is the wrong place to learn that.
async function reporterAddress(report: FixedReport): Promise<string | null> {
  if (report.email) return report.email;
  if (!report.userId) return null;
  const account = await prisma.user.findUnique({
    where: { id: report.userId },
    select: { email: true, emailVerified: true },
  });
  return account?.emailVerified ? account.email : null;
}

// What the report was about, named and linked the way the site names and links
// it. One row, by key — never a group loader — per the egress rules in lib/db.ts.
async function reportedItem(report: FixedReport): Promise<{ name: string; url: string } | null> {
  if (report.kind === "card" && report.cardId) {
    const card = await prisma.card.findUnique({
      where: { id: report.cardId },
      select: { id: true, slug: true, name: true },
    });
    return card ? { name: card.name, url: `${SITE_URL}${cardHref(card)}` } : null;
  }
  if (report.kind === "sealed" && report.sealedGroupKey) {
    // Cheapest row in the reported market: the same row getAllSealedGroups
    // takes a group's name from.
    const row = await prisma.sealedListing.findFirst({
      where: { groupKey: report.sealedGroupKey, country: report.country },
      orderBy: { priceCents: "asc" },
      select: { title: true, productType: true, setCode: true },
    });
    if (!row) return null;
    const setName = SETS.find((s) => s.code === row.setCode)?.name ?? null;
    const target = sealedReportTarget(row, setName);
    return { name: target.name, url: `${SITE_URL}${target.path}` };
  }
  return null;
}
