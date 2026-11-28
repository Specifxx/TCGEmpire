import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { grantGiftPassBccBatch, listGiftPassGranted, runGiftPassBatch } from "@/lib/premium-gift-pass-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The 3-day pass's Gmail console (/admin/premium-gift-pass; owner, 2026-11-27). Same dual gate as the other admin
// mutations (a logged-in admin OR ADMIN_TOKEN in body.key). Two actions:
//   preview — the dry run's counts per site, nothing written.
//   grant   — grant the pass to up to `limit` pending accounts of one site and return their addresses and the email, to send
//             by hand from Gmail as a BCC. Each account is marked sent, so the Brevo batch never mails it too.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) return NextResponse.json({ error: "Not authorised" }, { status: 404 });

  const site = typeof body?.site === "string" ? body.site : null;
  if (body?.action === "preview") {
    const r = await runGiftPassBatch({ dryRun: true, site });
    return NextResponse.json(r);
  }
  if (body?.action === "grant") {
    const limitRaw = Number(body?.limit);
    const r = await grantGiftPassBccBatch({ site, limit: Number.isFinite(limitRaw) ? limitRaw : undefined });
    if (r.ok) console.log(`admin gift pass (Gmail BCC): granted ${r.granted} on ${r.site} (failed ${r.failed}, remaining ${r.remaining}) by ${me?.email ?? "ADMIN_TOKEN"}`);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  if (body?.action === "granted") {
    // Read back who a batch was granted to (by the pass end it wrote), to send a Gmail that failed. Nothing is granted.
    const fromMs = Number(body?.fromMs);
    const toMs = Number(body?.toMs);
    if (!site || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
      return NextResponse.json({ ok: false, error: "site, fromMs and toMs are required" }, { status: 400 });
    }
    const emails = await listGiftPassGranted({ site, fromMs, toMs });
    return NextResponse.json({ ok: true, site, emails });
  }
  return NextResponse.json({ ok: false, error: "action must be preview, grant or granted" }, { status: 400 });
}
