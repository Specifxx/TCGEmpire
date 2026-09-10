import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runPremiumOfferBlast, sendPremiumOfferTest, type PremiumOfferProvider } from "@/lib/premium-offer";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds; the send is batched + resumable regardless

// The admin console's back end for the one-off Premium offer email
// (/admin/premium-offer). Three actions, all behind the same dual gate the
// other admin mutations use (logged-in admin OR ADMIN_TOKEN via body.key —
// see /api/admin/grant-premium):
//
//   preview — dry run: report who a send would reach, send nothing.
//   send    — the real thing, to the checked accounts (userIds) or, with no
//             selection, to everyone still pending. Batched under the
//             provider's daily cap; call again to continue.
//   test    — both wordings to one address, no stamp, so the copy can be
//             proofread in a real inbox first.
//
// The cron route (/api/cron/premium-offer) stays the CI/workflow entry point;
// this one exists so the owner can do it from a button. Both call the same
// lib, so the audience rules cannot drift between them.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const action = body?.action;
  const offerEnds = typeof body?.offerEnds === "string" ? body.offerEnds.trim() : "";
  const via: PremiumOfferProvider = body?.via === "resend" ? "resend" : "brevo";

  if (action === "test") {
    const to = typeof body?.to === "string" ? body.to.trim() : me?.email ?? "";
    if (!to) return NextResponse.json({ ok: false, error: "No address to send the test to" }, { status: 400 });
    const r = await sendPremiumOfferTest(to, offerEnds, via);
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

  const result = await runPremiumOfferBlast({
    offerEnds,
    dryRun: action === "preview",
    limit,
    via,
    userIds,
    resend: body?.resend === true,
  });
  if (action === "send" && result.ok) {
    // A blast by hand must be traceable in the function logs, like a grant.
    console.log(
      `admin premium-offer: sent ${result.sent}/${result.pending} (failed ${result.failed}, remaining ${result.remaining}) via ${via} until ${offerEnds} by ${me?.email ?? "ADMIN_TOKEN"}${userIds?.length ? ` to ${userIds.length} selected` : ""}`
    );
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
