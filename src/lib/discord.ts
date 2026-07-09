// Posts the daily market wrap + Riftle to the community Discord via an incoming
// webhook. No-ops (safely) unless DISCORD_WEBHOOK_URL is set, so it ships inert until
// the webhook is configured. Near-free reach that reuses content we already generate.
import { getLatestMarketReport } from "./posts";
import { SITE_URL, SITE_NAME } from "./site";

export async function postDiscordDaily(): Promise<{ ok: boolean; skipped?: string }> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: "no DISCORD_WEBHOOK_URL" };

  const wrap = await getLatestMarketReport().catch(() => null);
  const wrapUrl = wrap ? `${SITE_URL}/blog/${wrap.article.slug}` : `${SITE_URL}/market`;
  const wrapTitle = wrap?.article.title ?? "Today's Riftbound market";
  const wrapExcerpt = wrap?.article.excerpt ?? "See where the Riftbound market moved today.";

  const embed = {
    title: `📊 ${wrapTitle}`,
    url: wrapUrl,
    description: `${wrapExcerpt}\n\n🃏 **[Play today's Riftle](${SITE_URL}/riftle)** — guess the daily card and keep your streak.`,
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
