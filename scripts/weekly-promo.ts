/**
 * Weekly promo pack — free, automated marketing content from live price data.
 *
 * Pulls this week's biggest price movers (risers / drops / best value) and:
 *   1. AUTO-POSTS a digest to the community Discord (DISCORD_WEBHOOK_URL), and
 *   2. EMAILS the site owner (PROMO_EMAIL) a ready-to-paste promo pack:
 *      a suggested title + Reddit-formatted markdown post + an X/Twitter blurb.
 *
 * Reddit/X posting is deliberately human-in-the-loop: auto-posting bots get
 * accounts banned and break subreddit self-promo rules, so the pack is generated
 * automatically but YOU paste it. Discord (your own server) is fully automatic.
 *
 * All links carry UTM params so Vercel Analytics shows which channel works.
 *
 * Usage:
 *   npx tsx scripts/weekly-promo.ts              # generate + post/email
 *   npx tsx scripts/weekly-promo.ts --dry-run    # print, send nothing
 *   npx tsx scripts/weekly-promo.ts --fixture    # sample data (implies --dry-run)
 *
 * Env:
 *   DATABASE_URL          production DB (PriceHistory)
 *   DISCORD_WEBHOOK_URL   optional — Discord channel webhook for the auto-post
 *   RESEND_API_KEY        optional — enables the promo-pack email
 *   EMAIL_FROM            optional — verified sender (defaults in lib/email)
 *   PROMO_EMAIL           optional — recipient (default: CONTACT_EMAIL)
 *   PROMO_MARKET          optional — AU | US | UK (default AU)
 *
 * Scheduled by .github/workflows/weekly-promo.yml (Sat 06:30 AEST, after the
 * Friday-evening price refresh, so the numbers are fresh).
 */
import { prisma } from "../src/lib/db";
import { dbHistory } from "../src/lib/db-history";
import { getPriceMovers, type Mover, type PriceMovers } from "../src/lib/price-history";
import { sendEmail, isEmailEnabled } from "../src/lib/email";
import { formatMoney } from "../src/lib/format";
import { currencyOf, normalizeCountry, COUNTRIES, type Country } from "../src/lib/country";
import { cardHref } from "../src/lib/card-url";
import { CONTACT_EMAIL, SITE_URL } from "../src/lib/site";

// ── Content model ─────────────────────────────────────────────────────────────
// The minimal, channel-agnostic shape the formatters need (decoupled from Mover
// so the fixture doesn't have to fake a full CardTileData).
interface PromoItem {
  name: string;
  setCode: string;
  collectorNumber: string;
  href: string; // site-relative card URL
  nowCents: number;
  pct: number; // signed % (value items: negative discount off recent high)
}
interface PromoData {
  risers: PromoItem[];
  drops: PromoItem[];
  value: PromoItem[];
}

const toItem = (m: Mover): PromoItem => ({
  name: m.card.name,
  setCode: m.card.setCode,
  collectorNumber: m.card.collectorNumber,
  href: cardHref(m.card),
  nowCents: m.nowCents,
  pct: m.pct,
});

const fromMovers = (m: PriceMovers): PromoData => ({
  risers: m.spiking.map(toItem),
  drops: m.plummeting.map(toItem),
  value: m.value.map(toItem),
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const utm = (path: string, source: string) =>
  `${SITE_URL}${path}?utm_source=${source}&utm_medium=social&utm_campaign=weekly-movers`;

const signedPct = (pct: number) => `${pct > 0 ? "+" : ""}${pct}%`;

// Reddit tables break on "|" in cell text; card names are the only dynamic text.
const mdSafe = (s: string) => s.replace(/\|/g, "\\|");

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const weekOf = () =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

// ── Reddit post (markdown, for manual paste) ──────────────────────────────────
function redditTitle(d: PromoData): string {
  const bits: string[] = [];
  if (d.risers[0]) bits.push(`${d.risers[0].name} up ${Math.abs(d.risers[0].pct)}%`);
  if (d.drops[0]) bits.push(`${d.drops[0].name} down ${Math.abs(d.drops[0].pct)}%`);
  const hook = bits.length ? `: ${bits.join(", ")}` : "";
  return `Riftbound price report — week of ${weekOf()}${hook}`;
}

function redditTable(items: PromoItem[], currency: string, take: number): string {
  const rows = items
    .slice(0, take)
    .map(
      (i) =>
        `| [${mdSafe(i.name)}](${utm(i.href, "reddit")}) | ${i.setCode} ${i.collectorNumber} | ${formatMoney(i.nowCents, currency)} | ${signedPct(i.pct)} |`
    )
    .join("\n");
  return `| Card | # | Now | 7-day |\n|---|---|---|---|\n${rows}`;
}

function redditBody(d: PromoData, market: Country): string {
  const info = COUNTRIES[market];
  const cur = currencyOf(market);
  const sections: string[] = [];
  sections.push(
    `The biggest Riftbound single-card price moves this week, from live lowest in-stock prices compared across ${info.adjective} stores.`
  );
  if (d.risers.length) sections.push(`**📈 Spiking this week**\n\n${redditTable(d.risers, cur, 8)}`);
  if (d.drops.length) sections.push(`**📉 Biggest drops**\n\n${redditTable(d.drops, cur, 8)}`);
  if (d.value.length)
    sections.push(`**💎 Best value vs recent high**\n\n${redditTable(d.value, cur, 5)}`);
  sections.push(
    `Interactive version with price-history charts (covers AU / US / UK): [riftcompare.com/movers](${utm("/movers", "reddit")})`
  );
  sections.push(
    `*Prices are the ${info.place} market in ${cur}. Disclosure: I run RiftCompare — it's a free price-comparison site; happy to answer questions or take feedback.*`
  );
  return sections.join("\n\n");
}

// ── X / Twitter blurb ─────────────────────────────────────────────────────────
function xBlurb(d: PromoData): string {
  const trunc = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const lines: string[] = ["📊 Riftbound price movers this week:"];
  if (d.risers[0]) lines.push(`▲ ${trunc(d.risers[0].name)} ${signedPct(d.risers[0].pct)}`);
  if (d.drops[0]) lines.push(`▼ ${trunc(d.drops[0].name)} ${signedPct(d.drops[0].pct)}`);
  if (d.value[0]) lines.push(`💎 ${trunc(d.value[0].name)} ${Math.abs(d.value[0].pct)}% off recent high`);
  lines.push(`Full report → ${utm("/movers", "twitter")}`);
  lines.push("#Riftbound #LeagueOfLegends #TCG");
  return lines.join("\n");
}

// ── Discord digest (auto-posted via webhook) ──────────────────────────────────
function discordLines(items: PromoItem[], currency: string, take: number): string {
  return items
    .slice(0, take)
    .map(
      (i) =>
        `${i.pct > 0 ? "▲" : "▼"} [**${i.name}**](${utm(i.href, "discord")}) (${i.setCode} ${i.collectorNumber}) — ${formatMoney(i.nowCents, currency)} (${signedPct(i.pct)})`
    )
    .join("\n");
}

function discordEmbed(d: PromoData, market: Country) {
  const cur = currencyOf(market);
  const info = COUNTRIES[market];
  const parts: string[] = [];
  if (d.risers.length) parts.push(`**📈 Spiking this week**\n${discordLines(d.risers, cur, 5)}`);
  if (d.drops.length) parts.push(`**📉 Biggest drops**\n${discordLines(d.drops, cur, 5)}`);
  if (d.value.length) parts.push(`**💎 Best value vs recent high**\n${discordLines(d.value, cur, 5)}`);
  parts.push(`[See the full interactive report →](${utm("/movers", "discord")})`);
  return {
    username: "RiftCompare",
    embeds: [
      {
        title: `📊 Riftbound Price Movers — week of ${weekOf()}`,
        url: utm("/movers", "discord"),
        color: 0x34d17e,
        description: parts.join("\n\n").slice(0, 4096),
        footer: { text: `${info.place} market, ${cur} · live prices compared across stores · riftcompare.com` },
      },
    ],
  };
}

async function postDiscord(webhookUrl: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn(`[promo] Discord webhook returned ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (e) {
    console.warn("[promo] Discord post failed:", e);
    return false;
  }
}

// ── Promo-pack email (Reddit + X content, ready to paste) ─────────────────────
function promoEmailHtml(title: string, reddit: string, x: string): string {
  const pre = (s: string) =>
    `<pre style="margin:0;padding:14px 16px;background:#0b0e14;border:1px solid #233047;border-radius:10px;color:#d7dde6;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${escHtml(s)}</pre>`;
  return `<!doctype html><html><body style="margin:0;background:#0b0e14;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#131a26;border:1px solid #233047;border-radius:16px">
      <tr><td style="padding:28px 32px 6px"><div style="font-size:22px;font-weight:800;color:#fff">Rift<span style="color:#34d17e">Compare</span></div></td></tr>
      <tr><td style="padding:6px 32px 4px"><h1 style="margin:0;font-size:20px;color:#fff">📣 Your weekly promo pack is ready</h1></td></tr>
      <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
        Fresh from this week's price data. Two pastes and you're done — the Discord digest was already posted automatically.
      </td></tr>
      <tr><td style="padding:0 32px 6px;font-size:13px;font-weight:700;color:#34d17e">1 · Reddit — suggested title</td></tr>
      <tr><td style="padding:0 32px 14px">${pre(title)}</td></tr>
      <tr><td style="padding:0 32px 6px;font-size:13px;font-weight:700;color:#34d17e">2 · Reddit — post body (markdown)</td></tr>
      <tr><td style="padding:0 32px 14px">${pre(reddit)}</td></tr>
      <tr><td style="padding:0 32px 6px;font-size:13px;font-weight:700;color:#34d17e">3 · X / Twitter</td></tr>
      <tr><td style="padding:0 32px 14px">${pre(x)}</td></tr>
      <tr><td style="padding:6px 32px 20px;font-size:13px;line-height:1.7;color:#8b95a5">
        Posting tips: use markdown mode on Reddit, post when the US is awake, and reply to every comment —
        engagement is what makes these land. Skip a week rather than spam a quiet one.
      </td></tr>
      <tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
        Generated automatically by the weekly-promo workflow from live RiftCompare price data.
      </td></tr>
    </table></td></tr></table></body></html>`;
}

// ── Fixture (local preview without a DB; never posted) ───────────────────────
const FIXTURE: PromoData = {
  risers: [
    { name: "Master Yi, Wuju Bladesman", setCode: "OGN", collectorNumber: "045/298", href: "/card/sample", nowCents: 4250, pct: 28.4 },
    { name: "Irelia, Blade Dancer", setCode: "SFD", collectorNumber: "112/221", href: "/card/sample", nowCents: 1890, pct: 17.2 },
    { name: "Kai'Sa, Daughter of the Void", setCode: "UNL", collectorNumber: "203/219", href: "/card/sample", nowCents: 7600, pct: 12.9 },
  ],
  drops: [
    { name: "LeBlanc, Deceiver", setCode: "OGN", collectorNumber: "151/298", href: "/card/sample", nowCents: 2310, pct: -22.6 },
    { name: "Vex, Gloomist", setCode: "SFD", collectorNumber: "078/221", href: "/card/sample", nowCents: 980, pct: -15.1 },
  ],
  value: [
    { name: "Diana, Scorn of the Moon", setCode: "UNL", collectorNumber: "066/219", href: "/card/sample", nowCents: 1540, pct: -31.0 },
  ],
};

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = new Set(process.argv.slice(2));
  const fixture = args.has("--fixture");
  const dryRun = args.has("--dry-run") || fixture; // fixture data must never be posted

  const market = normalizeCountry(process.env.PROMO_MARKET);
  let data: PromoData;

  if (fixture) {
    console.log("[promo] using FIXTURE data (dry-run forced)");
    data = FIXTURE;
  } else {
    // Cheap explicit query first so a DB misconfiguration fails the workflow
    // loudly, instead of getPriceMovers' catch-all making it look like a quiet week.
    //
    // dbHistory, NOT prisma — and this guard is the reason the bug it was written
    // to catch went unnoticed for so long. PriceHistory lives in the separate
    // history project (RH6, see src/lib/db-history.ts); getPriceMovers() below
    // correctly reads it via dbHistory, but this pre-check queried the
    // OPERATIONAL database, whose PriceHistory is deliberately empty since the
    // RM3 cutover. So it returned 0 every Friday and the promo silently skipped
    // with "no price history yet" — the exact quiet failure the comment above
    // promises to prevent.
    const historyRows = await dbHistory.priceHistory.count({ where: { country: market } });
    if (historyRows === 0) {
      console.log(`[promo] no price history for ${market} yet — nothing to report, skipping.`);
      return;
    }
    data = fromMovers(await getPriceMovers(market, 10));
  }

  if (!data.risers.length && !data.drops.length && !data.value.length) {
    console.log("[promo] quiet week (no movers above thresholds) — skipping rather than posting noise.");
    return;
  }

  const title = redditTitle(data);
  const reddit = redditBody(data, market);
  const x = xBlurb(data);
  const embed = discordEmbed(data, market);

  if (dryRun) {
    console.log("\n━━━ REDDIT TITLE ━━━\n" + title);
    console.log("\n━━━ REDDIT BODY ━━━\n" + reddit);
    console.log("\n━━━ X / TWITTER ━━━\n" + x);
    console.log("\n━━━ DISCORD EMBED (JSON) ━━━\n" + JSON.stringify(embed, null, 2));
    console.log("\n[promo] dry-run — nothing was posted or emailed.");
    return;
  }

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  const emailTo = process.env.PROMO_EMAIL || CONTACT_EMAIL;
  if (!webhook && !isEmailEnabled()) {
    // No delivery channel set up yet — skip quietly instead of failing the weekly
    // cron (a red run every Friday is just noise). Set DISCORD_WEBHOOK_URL and/or
    // RESEND_API_KEY as repository secrets to actually post the promo.
    console.warn(
      "[promo] No delivery channel configured — skipping. Set DISCORD_WEBHOOK_URL (auto Discord post) and/or RESEND_API_KEY (promo-pack email) as repository secrets to enable it."
    );
    return;
  }

  let attempted = 0;
  let succeeded = 0;
  if (webhook) {
    attempted++;
    const ok = await postDiscord(webhook, embed);
    console.log(`[promo] Discord: ${ok ? "posted ✓" : "FAILED"}`);
    if (ok) succeeded++;
  }
  if (isEmailEnabled()) {
    attempted++;
    const ok = await sendEmail(emailTo, `📣 Weekly promo pack — ${title}`, promoEmailHtml(title, reddit, x));
    console.log(`[promo] Email to ${emailTo}: ${ok ? "sent ✓" : "FAILED"}`);
    if (ok) succeeded++;
  }
  if (succeeded === 0) throw new Error(`All ${attempted} configured channel(s) failed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
