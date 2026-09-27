import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// One-click opt-out for PRODUCT ANNOUNCEMENTS (e.g. the set-release blast sent to
// registered accounts). Separate from /api/newsletter/unsubscribe on purpose: that
// one manages the weekly digest's opt-IN list, this one is a suppression list for
// people who never subscribed to anything but did receive an announcement.
//
// Stamping optedOutAt (rather than deleting the row) is what makes the suppression
// durable — lib/release-day.ts filters on it, so the address is skipped by every
// future announcement. The row already exists: it was created at send time to mint
// the token.
//
// No auth: possession of the unguessable token IS the authorisation, which is what
// makes it genuinely one-click from an email client. Idempotent — clicking twice is
// fine, and an unknown token reports failure rather than silently "succeeding".
export const dynamic = "force-dynamic";

async function optOut(token: string) {
  if (!token) return { ok: false as const, error: "Missing token" };
  const row = await prisma.announcementOptOut.findUnique({ where: { token } }).catch(() => null);
  if (!row) return { ok: false as const, error: "Unknown or expired link" };
  if (row.optedOutAt) return { ok: true as const, already: true, email: row.email };
  await prisma.announcementOptOut.update({ where: { token }, data: { optedOutAt: new Date() } });
  return { ok: true as const, already: false, email: row.email };
}

// POST takes the token from a JSON body (the page's own flow) OR from the query
// string: RFC 8058 one-click unsubscribe (Gmail / Apple Mail's "Unsubscribe"
// button) POSTs the form body "List-Unsubscribe=One-Click" to the exact URL in
// the List-Unsubscribe header, so the token must ride in that URL. The
// price-drop announcement (lib/premium-offer.ts) sets that header.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { token?: string }));
  const fromQuery = new URL(req.url).searchParams.get("token") ?? "";
  const res = await optOut(typeof body?.token === "string" ? body.token : fromQuery);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

// GET so the link works straight from an email client (and for List-Unsubscribe
// crawlers that prefetch). Same effect, rendered by the page below.
export async function GET(req: Request) {
  const res = await optOut(new URL(req.url).searchParams.get("token") ?? "");
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
