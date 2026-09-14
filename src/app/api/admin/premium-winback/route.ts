import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runPremiumWinbackBlast, sendPremiumWinbackTest, type PremiumWinbackProvider } from "@/lib/premium-winback";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds; the send is batched + resumable regardless

// The admin console's back end for the win-back email
// (/admin/premium-winback). Three actions, same dual gate every other admin
// mutation uses (logged-in admin OR ADMIN_TOKEN via body.key — see
// /api/admin/grant-premium):
//
//   preview — dry run: report who a send would reach, send nothing.
//   send    — the real thing, to the checked accounts (userIds) or, with no
//             selection, to everyone still pending. Batched under the
//             provider's daily cap; call again to continue.
//   test    — one copy to an address of the caller's choosing, no stamp, so
//             the copy can be proofread in a real inbox first.
//
// No "grant" action here, unlike /api/admin/premium-offer's console: that
// campaign's grant is a manual owner step after Stripe checkout; this one's
// grant is automatic the moment the recipient claims their link, so there is
// nothing for the admin to do after sending.
//
// The cron route (/api/cron/premium-winback) stays the automation entry
// point; this one exists so the owner can do it from a button. Both call the
// same lib, so the audience rules cannot drift between them.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const action = body?.action;
  const registeredAfter = typeof body?.registeredAfter === "string" ? body.registeredAfter.trim() : "";
  const via: PremiumWinbackProvider = body?.via === "resend" ? "resend" : "brevo";

  if (action === "test") {
    const to = typeof body?.to === "string" ? body.to.trim() : me?.email ?? "";
    if (!to) return NextResponse.json({ ok: false, error: "No address to send the test to" }, { status: 400 });
    const r = await sendPremiumWinbackTest(to, via);
    return NextResponse.json({ ...r, to }, { status: r.ok ? 200 : 400 });
  }

  if (action !== "preview" && action !== "send") {
    return NextResponse.json({ ok: false, error: "action must be preview, send or test" }, { status: 400 });
  }

  const userIds = Array.isArray(body?.userIds)
    ? (body.userIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5000)
    : undefined;
  const limitRaw = Number(body?.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : undefined;

  const result = await runPremiumWinbackBlast({
    registeredAfter,
    dryRun: action === "preview",
    limit,
    via,
    userIds,
  });
  if (action === "send" && result.ok) {
    // A blast by hand must be traceable in the function logs, like a grant.
    console.log(
      `admin premium-winback: sent ${result.sent}/${result.pending} (failed ${result.failed}, remaining ${result.remaining}) via ${via} since ${registeredAfter} by ${me?.email ?? "ADMIN_TOKEN"}${userIds?.length ? ` to ${userIds.length} selected` : ""}`
    );
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
