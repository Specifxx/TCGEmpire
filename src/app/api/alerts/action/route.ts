import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { performAlertAction, verifyAlertAction } from "@/lib/alert-actions";

// POST — apply one signed one-tap action from a price-alert email (stop
// watching, snooze 30 days, set / lower a target). The logic, the signature
// check (403) and the target rules (Plus only, targetAlertLimit enforced) are
// lib/alert-actions.ts performAlertAction; this is only the transport.
//
// POST ONLY, on purpose: there is no GET handler (Next answers 405), because
// mail scanners and link prefetchers GET every link in a message. The email
// links to the /alerts/action confirmation page, whose button posts here.
//
// Three request shapes:
//   • the confirmation page's plain HTML form (form-encoded `t`) — answered
//     with a 303 back to that page carrying the outcome, so it works with no
//     JavaScript at all;
//   • JSON { token } — answered with JSON and the real status;
//   • the RFC 8058 one-click POST from a deck or sealed watch email's
//     List-Unsubscribe header (2026-09-29): the token rides the URL's `?t=`
//     and the body is the fixed "List-Unsubscribe=One-Click". That token is
//     always a SNOOZE (30 days, reversible, one watch) — never a stop, and
//     never the address-wide pause a card digest's one-click does, because
//     these emails are per watch. Answered with JSON.
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
  let oneClick = false;
  if (isForm) {
    const form = await req.formData().catch(() => null);
    const t = form?.get("t");
    token = typeof t === "string" ? t : null;
    if (!token && form?.get("List-Unsubscribe") === "One-Click") {
      // The mail client's one-click POST: the token is in the URL.
      token = new URL(req.url).searchParams.get("t");
      oneClick = true;
    }
  } else {
    const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
    token = typeof body?.token === "string" ? body.token : null;
  }

  const headers = { "Cache-Control": "no-store" };
  if (oneClick) {
    // One-click may only snooze: a stop token forwarded into a one-click POST
    // must not delete anything without the confirmation page's button.
    const v = verifyAlertAction(token);
    if (!v.ok || v.action !== "snooze") return NextResponse.json({ error: "This link is not valid for one-click." }, { status: 403, headers });
  }
  const result = await performAlertAction(prisma, token);
  if (isForm && !oneClick && result.outcome !== "invalid" && token) {
    const back = new URL(`/alerts/action?t=${encodeURIComponent(token)}&r=${result.outcome}`, req.url);
    return NextResponse.redirect(back, { status: 303, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}
