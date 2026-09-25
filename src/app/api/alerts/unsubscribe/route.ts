import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { alertEmailSummary, applyAlertEmailMode } from "@/lib/alert-mute";

export const dynamic = "force-dynamic";

// The footer and List-Unsubscribe target of every price-alert email, addressed
// by the address's unsubToken (no session: the click comes from a mail client).
//
// PAUSE, NOT DELETE, BY DEFAULT (2026-09-25). This used to delete every watch
// for the address on any POST. Now (lib/alert-mute.ts):
//   • POST form-encoded "List-Unsubscribe=One-Click" with ?token= — RFC 8058
//     one-click from the inbox's own Unsubscribe button. PAUSES alert email
//     (AlertMute), keeps every watch. No confirm step: it is reversible.
//   • POST JSON { token, mode } — the /unsubscribe page. mode "pause" (the
//     default), "resume", "delete" (every watch — the page's separate,
//     explicit button) or "remove" (one watch, with alertId).
//   • GET ?token= — what the token covers, for the page.

// GET ?token=... — summarise what a token covers, for the page UI.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const summary = await alertEmailSummary(prisma, token);
  // No rows: already removed (or a bad link) — not an error from the user's POV.
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  token: z.string().min(1).max(200),
  mode: z.enum(["pause", "resume", "delete", "remove"]).default("pause"),
  alertId: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(`alerts:unsub:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const url = new URL(req.url);
  const type = req.headers.get("content-type") ?? "";
  const headers = { "Cache-Control": "no-store" };

  // RFC 8058 one-click: the token rides the List-Unsubscribe URL's query and
  // the body is "List-Unsubscribe=One-Click". Whatever ?mode= says, this path
  // can only pause — an inbox button must never delete a watchlist.
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const token = url.searchParams.get("token") ?? "";
    const res = await applyAlertEmailMode(prisma, token, "pause", { source: "one-click" });
    return NextResponse.json(res.body, { status: res.status, headers });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  const { token, mode, alertId } = parsed.data;
  const res = await applyAlertEmailMode(prisma, token, mode, { alertId, source: "page" });
  return NextResponse.json(res.body, { status: res.status, headers });
}
