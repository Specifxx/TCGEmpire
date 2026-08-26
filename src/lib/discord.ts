// Posts a daily Discord update via an incoming webhook. No-ops (safely) unless
// DISCORD_WEBHOOK_URL is set, so it ships inert until the webhook is configured.
//
// The market wrap used to be featured here. The market-report feature is now
// DELETED, so there is no fresh wrap to feature and never will be —
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

// Generic alert poster — same webhook, same no-op-when-unset / try-catch shape
// as postDiscordDaily() above, but for operational alerts (store-health today)
// rather than the fixed daily promo embed. `lines` is joined into the embed
// description with newlines; Discord embed descriptions cap at 4096 chars, so
// this truncates rather than silently dropping a webhook call to an oversized
// payload — a truncated alert with a count of what's missing is still
// actionable, a failed POST is not.
export async function postDiscordAlert(
  title: string,
  lines: string[],
  opts?: { color?: number; url?: string },
): Promise<{ ok: boolean; skipped?: string }> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: "no DISCORD_WEBHOOK_URL" };
  if (!lines.length) return { ok: false, skipped: "no lines to post" };

  const MAX_DESC = 3900; // headroom under Discord's 4096-char embed description cap
  let description = lines.join("\n");
  if (description.length > MAX_DESC) {
    const kept = lines.reduce<string[]>((acc, line) => {
      const next = [...acc, line].join("\n");
      return next.length <= MAX_DESC ? [...acc, line] : acc;
    }, []);
    description = `${kept.join("\n")}\n…and ${lines.length - kept.length} more`;
  }

  const embed = {
    title,
    ...(opts?.url ? { url: opts.url } : {}),
    description,
    color: opts?.color ?? 0xef4444,
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
