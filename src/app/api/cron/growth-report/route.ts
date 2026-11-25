import { NextResponse } from "next/server";
import { sendEmail, sendEmailBrevo, isBrevoEnabled, getLastEmailError } from "@/lib/email";
import { growthReportEmail } from "@/lib/ops/owner";
import { liveRoute } from "@/lib/public-data/live-route";
import { loadEarnings } from "@/lib/earnings/sources";
import { loadCosts } from "@/lib/earnings/costs";
import { addDays, dayIn } from "@/lib/earnings/core";
import { readClickCounts } from "@/lib/click-counter";
import { loadShareCounts } from "@/lib/analytics/vercel";
import { buildGrowthReport, growthReportHtml, growthReportText, WEEKS } from "@/lib/earnings/growth-report";
import { prisma } from "@/lib/db";
import { stripeEnabled } from "@/lib/stripe";
import { computeSubscriptionMetrics, fetchAllSubscriptions } from "@/lib/subscription-metrics";
import { premiumReportSection } from "@/lib/premium-report";

// The PREMIUM section (lib/premium-report.ts): Stripe counts and the entitled-account count. Never fails the report.
async function premiumSection(): Promise<string> {
  if (!stripeEnabled()) return premiumReportSection(null);
  try {
    const [{ rows, capped }, entitled] = await Promise.all([
      fetchAllSubscriptions(),
      prisma.user.count({ where: { premiumUntil: { gt: new Date() } } }).catch(() => null),
    ]);
    return premiumReportSection(computeSubscriptionMetrics(rows, Date.now()), { entitled, capped });
  } catch {
    return premiumReportSection(null, { entitled: null, error: true });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST → one email with the weekly growth report (lib/earnings/growth-report.ts)
// to the fixed business inbox (lib/ops/owner.ts growthReportEmail). Called by
// .github/workflows/growth-report.yml, whose logs are public: the response says
// only whether it was sent, never an amount. Needs CRON_SECRET, fails closed.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handlePOST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = dayIn(Date.now());
  const [sources, clicks, costs, shares, premium] = await Promise.all([
    loadEarnings(true),
    readClickCounts(addDays(today, -7 * WEEKS - 1)).catch(() => new Map()),
    loadCosts(true).catch(() => []),
    loadShareCounts(addDays(today, -7 * WEEKS - 1), today).catch(() => null),
    premiumSection(),
  ]);
  const vercel = costs.find((c) => c.key === "vercel");
  const text = `${growthReportText(
    buildGrowthReport(sources, clicks, today, {
      vercel: vercel?.status === "ok" ? vercel.projects ?? [] : null,
      other: costs.filter((c) => c.key !== "vercel").flatMap((c) => c.days),
    }, shares?.status === "ok" ? shares.sites : null),
  )}\n\n${premium}`;
  const subject = `Growth report ${today}`;
  const to = growthReportEmail();
  if (await sendEmail(to, subject, growthReportHtml(text), { text })) return NextResponse.json({ ok: true, via: "resend" });
  if (isBrevoEnabled() && (await sendEmailBrevo(to, subject, growthReportHtml(text), { text }))) return NextResponse.json({ ok: true, via: "brevo" });
  return NextResponse.json({ ok: false, error: getLastEmailError() ?? "no mail provider accepted it" }, { status: 502 });
}

export const POST = liveRoute(handlePOST);
