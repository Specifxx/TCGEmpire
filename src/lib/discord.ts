// Posts a daily Discord update via an incoming webhook. No-ops (safely) unless
// DISCORD_WEBHOOK_URL is set, so it ships inert until the webhook is configured.
//
// The market wrap used to be featured here. Report generation is now DELETED (see
// lib/market-report.ts), so there is no fresh wrap to feature and never will be —
// the old freshness gate around it was already permanently false, so the branch
// and its getLatestMarketReport() read are gone rather than left as dead weight.
// The daily post is the Riftle prompt.
import { SITE_URL, SITE_NAME } from "./site";

export async function postDiscordDaily(): Promise<{ ok: boolean; skipped?: string }> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: "no DISCORD_WEBHOOK_URL" };

  const embed = {
    title: "🃏 Today's Riftle",
    url: `${SITE_URL}/riftle`,
    description: `Guess the daily Riftbound card and keep your streak — or **[compare live prices](${SITE_URL}/browse)** on any card, free.`,
    color: 0x34d17e,
    footer: { text: `${SITE_NAME} · riftcompare.com` },
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: SITE_NAME, embeds: [embed] }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false, skipped: "post failed" };
  }
}
