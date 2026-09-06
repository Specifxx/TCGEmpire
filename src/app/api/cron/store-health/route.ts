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
    let postSkipped: string | undefined;
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
      postSkipped = result.ok ? undefined : result.skipped ?? "post failed";
    }
    // BREAK THE ALERT COUNT DOWN IN THE RESPONSE, not just in Discord.
    //
    // The Discord post is best-effort and silently no-ops when
    // DISCORD_WEBHOOK_URL is unset (lib/discord.ts returns
    // { ok: false, skipped: "no DISCORD_WEBHOOK_URL" }). In production it IS
    // unset, so every alert this monitor has raised since 2026-08-17 has gone
    // nowhere, and the only thing the caller could see was
    // {"alerts":107,"posted":false} — a number with no way to act on it.
    //
    // The cron caller (.github/workflows/store-health.yml) prints this body into
    // its job log, so putting the breakdown here makes the monitor legible from
    // the workflow run alone, with no webhook and no admin page. `skipped` says
    // why a post did not happen rather than leaving `posted: false` ambiguous
    // between "nothing to say" and "no channel to say it on".
    const byKind: Record<string, number> = {};
    for (const a of alerts) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
    const worst = [...alerts]
      .sort((a, b) => a.retailer.localeCompare(b.retailer))
      .slice(0, 20)
      .map((a) => `${a.retailer}|${a.country}|${a.kind}`);

    return NextResponse.json({
      ok: true,
      stores: rows.length,
      alerts: alerts.length,
      byKind,
      sample: worst,
      posted,
      ...(postSkipped ? { skipped: postSkipped } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "store health check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
