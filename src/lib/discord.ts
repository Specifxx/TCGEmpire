// Posts a daily Discord update via an incoming webhook. No-ops (safely) unless
// DISCORD_WEBHOOK_URL is set, so it ships inert until the webhook is configured.
//
// The market wrap used to be featured here. The market-report feature is now
// DELETED, so there is no fresh wrap to feature and never will be —
// the old freshness gate around it was already permanently false, so the branch
// and its getLatestMarketReport() read are gone rather than left as dead weight.
// The daily post is the Riftle prompt, plus — while a set is still upcoming —
// that set's live reveal tracker (see the seasonal note on postDiscordDaily).
import { SITE_URL, SITE_NAME } from "./site";
import { nextUpcomingSet } from "./constants";
import { spoilersHrefForSet } from "./release-calendar";

export async function postDiscordDaily(): Promise<{ ok: boolean; skipped?: string }> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: "no DISCORD_WEBHOOK_URL" };

  const riftle = {
    title: "🃏 Today's Riftle",
    url: `${SITE_URL}/riftle`,
    description: `Guess the daily Riftbound card and keep your streak — or **[compare live prices](${SITE_URL}/browse)** on any card, free.`,
    color: 0x34d17e,
    footer: { text: `${SITE_NAME} · riftcompare.com` },
  };

  // SEASONAL SECOND EMBED — the next set's reveal tracker, led FIRST because
  // during a preview season it is the thing the room is actually there for, and
  // unlike Riftle it changes every day on its own (the gallery is a `setAll`
  // query, so the morning after each import the page is already current).
  //
  // Names no set and needs no diary entry to switch off: spoilersHrefForSet()
  // returns null from the street date, so this reverts to the Riftle-only post
  // by itself and comes back on its own for the set after. The daily poster used
  // to feature the market wrap this way and rotted when that feature was
  // deleted — hence resolving the link from the release calendar rather than
  // hardcoding one here.
  const upcoming = nextUpcomingSet();
  const spoilersHref = upcoming ? spoilersHrefForSet(upcoming.code) : null;
  const spoilers = spoilersHref && upcoming
    ? {
        title: `✨ ${upcoming.name} — every card revealed so far`,
        url: `${SITE_URL}${spoilersHref}`,
        description: `The live reveal log, updated as each official ${upcoming.name} card lands. Prices appear on every card as stores list it.`,
        color: 0xc9a227,
        footer: { text: `${SITE_NAME} · riftcompare.com` },
      }
    : null;

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: SITE_NAME, embeds: spoilers ? [spoilers, riftle] : [riftle] }),
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
