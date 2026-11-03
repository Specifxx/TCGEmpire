import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reviewCorsHeaders, reviewSiteForOrigin } from "@/lib/site-reviews/sites";
import { parseSiteReview } from "@/lib/site-reviews/input";

export const dynamic = "force-dynamic";

// THE SISTER SITES' "RATE US" CARD (2026-11-03, owner: the feedback pop-up on
// every site, its reviews public on each, approved in RiftCompare's admin).
// Called cross-origin from the sites in lib/site-reviews/sites.ts only (exact
// origins, no wildcard); the site is taken from the Origin header, never from
// the form, so one site cannot write another's reviews.
//
// What is stored is a Feedback row with `site` set: the stars count in that
// site's public score at once (owner: "star reviews are automatically on the
// website"); a written review stays NEW until it is approved in /admin/reviews,
// and only when its writer left "Show my review" ticked. No email address is
// asked for or kept, and nothing is emailed: ratings and reviews wait in the
// admin queue (owner, 2026-10-27: no email per rating or review).
//
// Abuse controls: per-IP rate limit, a honeypot, hard length bounds, and
// moderation before any word is shown.

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: reviewSiteForOrigin(origin) ? 204 : 403, headers: reviewCorsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...reviewCorsHeaders(origin), "Cache-Control": "no-store" };
  const site = reviewSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });

  const rl = rateLimit(`site-reviews:${clientIp(req)}`, 8, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many ratings from here just now. Try again later." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfter) } });
  }

  // sendBeacon posts text/plain to stay a "simple" request; both arrive as JSON text.
  const raw = await req.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const parsed = parseSiteReview(body);
  if (parsed.kind === "bot") return NextResponse.json({ ok: true }, { headers });
  if (parsed.kind === "error") return NextResponse.json({ error: parsed.error }, { status: 400, headers });

  try {
    await prisma.feedback.create({ data: { ...parsed.row, site: site.key } });
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now. Please try again." }, { status: 500, headers });
  }
}
