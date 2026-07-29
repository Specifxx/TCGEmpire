// Posts a daily Discord update via an incoming webhook. No-ops (safely) unless
// DISCORD_WEBHOOK_URL is set, so it ships inert until the webhook is configured.
//
// The market wrap used to be featured here every day. Report generation is now
// stopped entirely (see lib/market-report.ts — a run of near-identical templated
// pages was an AdSense Publisher-Policy risk), so getLatestMarketReport() would
// return the SAME row forever, getting staler by the day. FRESH_DAYS gates it:
// only feature the wrap if one still exists AND was published recently: since
// nothing new gets created, this naturally and permanently stops firing a few
// days after generation stopped, with no further code change needed.
import { getLatestMarketReport } from "./posts";
import { SITE_URL, SITE_NAME } from "./site";

const FRESH_DAYS = 3;

export async function postDiscordDaily(): Promise<{ ok: boolean; skipped?: string }> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: "no DISCORD_WEBHOOK_URL" };

  const report = await getLatestMarketReport().catch(() => null);
  const ageMs = report ? Date.now() - new Date(`${report.day}T00:00:00+10:00`).getTime() : Infinity;
  const wrap = ageMs <= FRESH_DAYS * 86400_000 ? report : null;

  const embed = wrap
    ? {
        title: `📊 ${wrap.article.title}`,
        url: `${SITE_URL}/blog/${wrap.article.slug}`,
        description: `${wrap.article.excerpt}\n\n🃏 **[Play today's Riftle](${SITE_URL}/riftle)** — guess the daily card and keep your streak.`,
        color: 0x34d17e,
        footer: { text: `${SITE_NAME} · riftcompare.com` },
      }
    : {
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
