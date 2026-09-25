import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { performAlertAction } from "@/lib/alert-actions";

// POST — apply one signed one-tap action from a price-alert email (stop
// watching, snooze 30 days, set / lower a target). The logic, the signature
// check (403) and the target rules (Plus only, targetAlertLimit enforced) are
// lib/alert-actions.ts performAlertAction; this is only the transport.
//
// POST ONLY, on purpose: there is no GET handler (Next answers 405), because
// mail scanners and link prefetchers GET every link in a message. The email
// links to the /alerts/action confirmation page, whose button posts here.
//
// Two request shapes:
//   • the confirmation page's plain HTML form (form-encoded `t`) — answered
//     with a 303 back to that page carrying the outcome, so it works with no
//     JavaScript at all;
//   • JSON { token } — answered with JSON and the real status.
// A bad, tampered or expired token is a 403 either way.
//
// Addressed by the signed token alone, like the unsubscribe link: the tap
// comes from a mail client with no session cookie.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(`alerts:action:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const type = req.headers.get("content-type") ?? "";
  const isForm = type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
  let token: string | null = null;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const t = form?.get("t");
    token = typeof t === "string" ? t : null;
  } else {
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token : null;
  }

  const result = await performAlertAction(prisma, token);
  const headers = { "Cache-Control": "no-store" };
  if (isForm && result.outcome !== "invalid" && token) {
    const back = new URL(`/alerts/action?t=${encodeURIComponent(token)}&r=${result.outcome}`, req.url);
    return NextResponse.redirect(back, { status: 303, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}
