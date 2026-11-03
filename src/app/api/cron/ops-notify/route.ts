import { NextResponse } from "next/server";
import { sendEmail, sendEmailBrevo, isBrevoEnabled, getLastEmailError } from "@/lib/email";
import { ownerEmail } from "@/lib/ops/owner";
import { siteSelfReport } from "@/lib/ops/self-report";
import { liveRoute } from "@/lib/public-data/live-route";
import { prisma } from "@/lib/db";
import { earningsHealth, loadEarnings } from "@/lib/earnings/sources";
import { costsHealth, loadCosts } from "@/lib/earnings/costs";
import { dayIn } from "@/lib/earnings/core";
import { EARNINGS_MARKER, EARNINGS_UNAVAILABLE, earningsDigest, fillEarnings } from "@/lib/earnings/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The ops monitor (GitHub Actions, scripts/ops-monitor.ts) holds no mail keys; they
// live here, in Vercel. So the monitor decides WHAT to say and this route says it.
//
//   GET   what the site can see about itself: which required settings are missing
//         (names only) and whether its mail keys are accepted. No values, ever.
//   POST  { subject, html, text } → one email to the OWNER. A weekly digest
//         carries EARNINGS_MARKER, which is replaced here with the money section
//         (lib/earnings/digest.ts): the amounts go only to the owner's inbox, never
//         back to the caller, whose logs are public.
//
// The recipient is fixed on the server (lib/ops/owner.ts) and never read from the
// request, and the route needs CRON_SECRET, so it cannot be used to mail anyone else.
// Fails CLOSED when CRON_SECRET is unset, like every other /api/cron route.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleGET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // One count on a tiny table: whether any Stores plan exists, which makes
  // STRIPE_STORE_PRICE_ID required (lib/ops/self-report.ts). Unreadable → not counted.
  const storePlanSubscriptions = await prisma.storePlanSubscription.count().catch(() => null);
  // The earnings dashboard's sources: which are set up and whether they answer
  // (status and the API's error text only; lib/earnings/sources.ts). Uses the same
  // 30-minute memo as the dashboard, so this adds at most one read per source.
  // Capped at 20 s (this route has 30): a slow source leaves the earnings line out
  // rather than costing the rest of the report.
  const earnings = await Promise.race([
    Promise.all([earningsHealth(), costsHealth()])
      .then(([e, c]) => [...e, ...c])
      .catch(() => undefined),
    new Promise<undefined>((r) => setTimeout(() => r(undefined), 20_000)),
  ]);
  return NextResponse.json({ ...(await siteSelfReport(process.env, { storePlanSubscriptions })), earnings });
}

const MAX_BODY = 300_000;

async function handlePOST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: { subject?: unknown; html?: unknown; text?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const subject = typeof body.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").slice(0, 200) : "";
  const html = typeof body.html === "string" ? body.html : "";
  const text = typeof body.text === "string" ? body.text : undefined;
  if (!subject || !html) return NextResponse.json({ error: "subject and html are required" }, { status: 400 });

  let mail: { html: string; text?: string } = { html, text };
  if (html.includes(EARNINGS_MARKER)) {
    const block = await Promise.race([
      Promise.all([loadEarnings(false), loadCosts(false)])
        .then(([sources, costs]) => earningsDigest(sources, costs, dayIn(Date.now()), `${new URL(req.url).origin}/admin/earnings`))
        .catch(() => EARNINGS_UNAVAILABLE),
      new Promise<typeof EARNINGS_UNAVAILABLE>((r) => setTimeout(() => r(EARNINGS_UNAVAILABLE), 20_000)),
    ]);
    mail = fillEarnings(mail, block);
  }

  const to = ownerEmail();
  if (await sendEmail(to, subject, mail.html, { text: mail.text })) return NextResponse.json({ ok: true, via: "resend" });
  // Resend failed (or is unset): Brevo, if it is set up, rather than losing the alert.
  if (isBrevoEnabled() && (await sendEmailBrevo(to, subject, mail.html, { text: mail.text }))) return NextResponse.json({ ok: true, via: "brevo" });
  return NextResponse.json({ ok: false, error: getLastEmailError() ?? "no mail provider accepted it" }, { status: 502 });
}

export const GET = liveRoute(handleGET);
export const POST = liveRoute(handlePOST);
