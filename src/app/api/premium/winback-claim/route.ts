import { NextResponse } from "next/server";
import { claimPremiumWinbackTrial } from "@/lib/premium-winback";

// The actual grant. POST-ONLY, deliberately — no GET handler exists on this
// route at all, so there is nothing for a mail-scanner's pre-fetch of the
// EMAIL link to hit here even by accident (the email link points at the page
// in ../../premium/claim, which only ever GETs; that page's own "Claim now"
// button is what POSTs here, on an explicit click). See
// lib/premium-winback.ts's header for the full reasoning.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ ok: false, reason: "not-found" }, { status: 400 });

  const result = await claimPremiumWinbackTrial(token);
  if (result.ok) {
    return NextResponse.json({ ok: true, premiumUntil: result.premiumUntil.toISOString() });
  }
  const status = result.reason === "not-found" ? 404 : 409;
  return NextResponse.json({ ok: false, reason: result.reason }, { status });
}
