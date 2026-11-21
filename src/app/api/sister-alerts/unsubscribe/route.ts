import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) for the sister-site
// alert emails: the inbox's own Unsubscribe button POSTs here with ?t=.
// Stops every alert and weekly email for the address; the weekly email's own
// header adds &digest=<site>, which stops only that site's weekly email. A GET (a person or a scanner opening the
// URL) goes to the manage page, which deletes nothing without a button press.
export async function POST(req: Request) {
  const rl = rateLimit(`sister-alerts:unsub:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token || token.length > 100) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const a = await prisma.sisterAlertAddress.findUnique({ where: { token }, select: { email: true } });
  const digest = (new URL(req.url).searchParams.get("digest") ?? "").slice(0, 32);
  if (a && digest) await prisma.sisterDigest.deleteMany({ where: { email: a.email, site: digest } });
  else if (a) {
    await prisma.sisterAlert.deleteMany({ where: { email: a.email } });
    await prisma.sisterDigest.deleteMany({ where: { email: a.email } });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export function GET(req: Request) {
  const u = new URL(req.url);
  const digest = (u.searchParams.get("digest") ?? "").slice(0, 32);
  const stop = digest ? `digest:${digest}` : "all";
  // A RELATIVE Location: reached through a sister's own /account-service/alerts/unsubscribe rewrite, the visitor stays on that
  // site's address (owner, 2026-11-19: sign-up and alert pages never send the visitor to another site).
  return new Response(null, { status: 303, headers: { Location: `manage?t=${encodeURIComponent(u.searchParams.get("t") ?? "")}&stop=${encodeURIComponent(stop)}`, "Cache-Control": "no-store" } });
}
