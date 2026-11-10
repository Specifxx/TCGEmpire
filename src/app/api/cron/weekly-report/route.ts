import { NextResponse } from "next/server";
import { sendEmail, sendEmailBrevo, isBrevoEnabled, getLastEmailError } from "@/lib/email";
import { growthReportEmail, ownerEmail } from "@/lib/ops/owner";
import { liveRoute } from "@/lib/public-data/live-route";
import { loadEarnings } from "@/lib/earnings/sources";
import { loadCosts } from "@/lib/earnings/costs";
import { addDays, dayIn } from "@/lib/earnings/core";
import { EARNINGS_UNAVAILABLE, earningsDigest } from "@/lib/earnings/digest";
import { buildGrowthReport, growthReportText, WEEKS } from "@/lib/earnings/growth-report";
import { readClickCounts } from "@/lib/click-counter";
import { getLatestReport } from "@/lib/ops/snapshot";
import { loadHq } from "@/lib/hq/load";
import { buildWeeklyEmail, buyClicksBySite } from "@/lib/hq/weekly-email";
import { bingLines, bingSubmitLines, loadBing, loadBingSubmit } from "@/lib/hq/bing";
import { loadBuyClickCounts } from "@/lib/analytics/vercel";
import { loadNetworkClicks } from "@/lib/analytics/click-networks";
import { loadSearchTest, searchTestInput } from "@/lib/earnings/search-test";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST → THE ONE MONDAY REPORT (lib/hq/weekly-email.ts): Empire HQ's rows, the
// owner's open steps, RiftCompare's flagged checks, the money section and the
// growth review's detail, to the owner and the business inbox the growth review
// reads. Called by the ops monitor's Sunday-evening (Monday Sydney) run, which falls
// back to its own plain digest if this fails. It replaces the weekly digest and the
// separate growth report email (DECISIONS.md, "Empire HQ and the one Monday report").
// The caller's logs are public: the response says only whether it was sent.
// Needs CRON_SECRET, fails closed; recipients are fixed on the server.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

async function send(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (await sendEmail(to, subject, html, { text })) return true;
  return isBrevoEnabled() && (await sendEmailBrevo(to, subject, html, { text }));
}

async function handlePOST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = new URL(req.url).origin;
  const today = dayIn(Date.now());
  const weekFrom = addDays(today, -7);
  const weekTo = addDays(today, -1);
  const [hq, report, sources, costs, clicks, buy, nets, searchTest, bing, bingSubmit] = await Promise.all([
    loadHq(true),
    getLatestReport(),
    within(loadEarnings(false), 25_000, null),
    within(loadCosts(false), 25_000, null),
    within(readClickCounts(addDays(today, -7 * WEEKS - 1)), 10_000, new Map()),
    within(loadBuyClickCounts(weekFrom, weekTo), 20_000, null),
    within(loadNetworkClicks(weekFrom, weekTo), 30_000, null),
    within(loadSearchTest(), 10_000, null),
    within(loadBing(), 10_000, null),
    within(loadBingSubmit(), 10_000, null),
  ]);
  const money = sources && costs ? earningsDigest(sources, costs, today, `${origin}/admin/earnings`) : EARNINGS_UNAVAILABLE;
  const vercel = costs?.find((c) => c.key === "vercel");
  const growthText = sources
    ? growthReportText(
        buildGrowthReport(sources, clicks, today, {
          vercel: vercel?.status === "ok" ? vercel.projects ?? [] : null,
          other: (costs ?? []).filter((c) => c.key !== "vercel").flatMap((c) => c.days),
        }),
      )
    : null;
  const mail = buildWeeklyEmail({ hq, riftChecks: report?.results ?? [], money, growthText, siteUrl: origin, today, buyClicks: buy?.status === "ok" ? buyClicksBySite(buy.sites, weekFrom, weekTo) : null, networks: nets?.status === "ok" ? nets.sites : null, search: searchTestInput(searchTest, sources, today), bing: bingLines(bing), bingSubmit: bingSubmitLines(bingSubmit) });

  const recipients = [...new Set([ownerEmail(), growthReportEmail()])];
  let sent = 0;
  for (const to of recipients) if (await send(to, mail.subject, mail.html, mail.text)) sent++;
  if (!sent) return NextResponse.json({ ok: false, error: getLastEmailError() ?? "no mail provider accepted it" }, { status: 502 });
  return NextResponse.json({ ok: true, sent, of: recipients.length });
}

export const POST = liveRoute(handlePOST);
