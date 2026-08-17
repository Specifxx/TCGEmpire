import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// One-click opt-out for the weekly digest sent to registered accounts (see
// lib/user-digest.ts). Mirrors /api/announcements/unsubscribe exactly, but
// against UserDigestOptOut — a deliberately separate table so unsubscribing
// from this recurring digest can never be misread as "already got the next
// one-off release-day blast" (see the model comment in schema.prisma).
//
// No auth: possession of the unguessable token IS the authorisation. Idempotent
// — clicking twice is fine, and an unknown token reports failure rather than
// silently "succeeding".
export const dynamic = "force-dynamic";

async function optOut(token: string) {
  if (!token) return { ok: false as const, error: "Missing token" };
  const row = await prisma.userDigestOptOut.findUnique({ where: { token } }).catch(() => null);
  if (!row) return { ok: false as const, error: "Unknown or expired link" };
  if (row.optedOutAt) return { ok: true as const, already: true, email: row.email };
  await prisma.userDigestOptOut.update({ where: { token }, data: { optedOutAt: new Date() } });
  return { ok: true as const, already: false, email: row.email };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { token?: string }));
  const res = await optOut(typeof body?.token === "string" ? body.token : "");
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

// GET so the link works straight from an email client (and for List-Unsubscribe
// crawlers that prefetch). Same effect, rendered by the page below.
export async function GET(req: Request) {
  const res = await optOut(new URL(req.url).searchParams.get("token") ?? "");
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
