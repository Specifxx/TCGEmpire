// Posts operational alerts to Discord via an incoming webhook. No-ops (safely)
// unless DISCORD_WEBHOOK_URL is set. The daily Riftle post that used to live
// here was retired with the price bot on 2026-10-16 (DECISIONS.md, "Ten
// features nobody used"): the webhook was never set in production, so it had
// never posted.
import { SITE_NAME } from "./site";

// Generic alert poster (store-health today). `lines` is joined into the embed
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
