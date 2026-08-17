import { NextResponse } from "next/server";
import { checkStoreHealth, formatHealthAlerts } from "@/lib/store-health";
import { postDiscordAlert } from "@/lib/discord";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  // Same CRON_SECRET as the other /api/cron/* routes — no new secret to
  // provision. Fails CLOSED when unset: an open endpoint would let anyone
  // trigger a full-catalogue scan and a Discord post on demand.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { rows, alerts } = await checkStoreHealth();
    let posted = false;
    // Only post when there's something to act on — a clean run should be silent,
    // not a daily "all good" message competing for attention in the channel.
    if (alerts.length) {
      const lines = formatHealthAlerts(alerts);
      const result = await postDiscordAlert(
        `⚠️ ${alerts.length} store data-health alert${alerts.length === 1 ? "" : "s"}`,
        lines,
        { url: `${SITE_URL}/admin/store-health` },
      );
      posted = result.ok;
    }
    return NextResponse.json({ ok: true, stores: rows.length, alerts: alerts.length, posted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "store health check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
