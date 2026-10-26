import { formatMoney } from "../format";
import { SOURCE_LABELS, tagBreakdown, totalFor, type RangeKey, type SourceResult } from "./core";
import type { CostLine } from "./costs";

// THE MONEY SECTION OF THE WEEKLY DIGEST (2026-10-26, owner: "be my business
// manager … where we're making the most money"). DECISIONS.md, "Money in the
// weekly digest". Earnings by source and eBay earnings by SITE (the tracking
// tag's prefix), for 7 and 30 days, with costs and profit, in the owner's email
// every Monday.
//
// The figures are private: every repository is public, and so are its Actions
// logs. So the ops monitor (GitHub Actions) only puts EARNINGS_MARKER in the
// digest, and the site's /api/cron/ops-notify, which holds the reporting keys,
// replaces it on the way to the inbox. No amount ever reaches a log, the
// response or the repository.
//
// PURE: the route loads the sources and costs; this only formats them.

export const EARNINGS_MARKER = "<!--earnings-digest-->";
export const EARNINGS_MARKER_TEXT = "[earnings-digest]";

const DISPLAY = "AUD"; // the owner's currency, like /admin/earnings

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface EarningsDigest {
  html: string;
  text: string;
}

export function earningsDigest(sources: readonly SourceResult[], costs: readonly CostLine[], today: string, adminUrl: string): EarningsDigest {
  const money = (c: number) => formatMoney(c, DISPLAY);
  const live = sources.filter((s) => s.status !== "not-configured" || s.days.length);
  const sum = (r: RangeKey) => live.reduce((n, s) => n + totalFor(s.days, r, today, DISPLAY).cents, 0);
  const costSum = (r: RangeKey) => costs.reduce((n, c) => n + totalFor(c.days, r, today, DISPLAY).cents, 0);

  const rows = live.map((s) => ({
    label: SOURCE_LABELS[s.key],
    d7: totalFor(s.days, "7d", today, DISPLAY).cents,
    d30: totalFor(s.days, "30d", today, DISPLAY).cents,
    note: s.status === "error" ? "not answering" : "",
  }));
  rows.sort((a, b) => b.d30 - a.d30);
  const off = sources.filter((s) => s.status === "not-configured" && !s.days.length).map((s) => SOURCE_LABELS[s.key]);

  // eBay and TCGplayer by site: each network's tracking tag (customid / sharedid), grouped by prefix.
  const bySite = (["ebay", "tcgplayer"] as const).flatMap((key) => {
    const s = sources.find((x) => x.key === key);
    const groups = s?.tags ? tagBreakdown(s.tags, "30d", today, DISPLAY).filter((g) => g.cents || g.sales) : [];
    return groups.length ? [{ name: key === "ebay" ? "eBay" : "TCGplayer", groups }] : [];
  });

  const total7 = sum("7d");
  const total30 = sum("30d");
  const cost30 = costSum("30d");

  const cell = "padding:4px 8px;font-size:13px;color:#b8c0cc;border-bottom:1px solid #1b2433";
  const num = `${cell};text-align:right;white-space:nowrap`;
  const head = "padding:4px 8px;font-size:11px;color:#6b7585;text-transform:uppercase;letter-spacing:.05em";
  let html = `<tr><td style="padding:18px 32px 4px;font-size:11px;font-weight:700;color:#6b7585;text-transform:uppercase;letter-spacing:.06em">Money</td></tr>`;
  html += `<tr><td style="padding:2px 32px 6px;font-size:14px;line-height:1.6;color:#e6ebf2"><strong>${esc(money(total30))}</strong> earned in the last 30 days (${esc(money(total7))} in the last 7). Costs ${esc(money(cost30))}, profit <strong>${esc(money(total30 - cost30))}</strong>.</td></tr>`;
  html += `<tr><td style="padding:2px 32px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="${head}">Source</td><td style="${head};text-align:right">7 days</td><td style="${head};text-align:right">30 days</td></tr>`;
  for (const r of rows) {
    html += `<tr><td style="${cell}">${esc(r.label)}${r.note ? ` <span style="color:#eab308">(${esc(r.note)})</span>` : ""}</td><td style="${num}">${esc(money(r.d7))}</td><td style="${num}">${esc(money(r.d30))}</td></tr>`;
  }
  html += `</table></td></tr>`;
  for (const { name, groups: sites } of bySite) {
    html += `<tr><td style="padding:10px 32px 2px;font-size:13px;color:#e6ebf2"><strong>${name} by site, 30 days</strong></td></tr>`;
    html += `<tr><td style="padding:2px 32px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%">`;
    for (const g of sites) {
      html += `<tr><td style="${cell}">${esc(g.label)}</td><td style="${num}">${g.sales} sale${g.sales === 1 ? "" : "s"}</td><td style="${num}">${esc(money(g.cents))}</td></tr>`;
      // Untagged sales: the biggest few, by what the report says about them (untaggedHint).
      if (!g.key) for (const t of g.tags.slice(0, 3)) html += `<tr><td style="${cell};padding-left:20px;font-size:12px">${esc(t.tag)}</td><td style="${num};font-size:12px">${t.sales}</td><td style="${num};font-size:12px">${esc(money(t.cents))}</td></tr>`;
    }
    html += `</table></td></tr>`;
  }
  if (off.length) html += `<tr><td style="padding:6px 32px 2px;font-size:12px;color:#6b7585">Not connected: ${esc(off.join(", "))}.</td></tr>`;
  html += `<tr><td style="padding:6px 32px 4px;font-size:12px;color:#6b7585">In AUD at the site's reference rates; eBay and TCGplayer include pending. <a href="${esc(adminUrl)}" style="color:#f29733">Open earnings</a></td></tr>`;

  const text = [
    "MONEY",
    `  Last 30 days: ${money(total30)} earned (7 days: ${money(total7)}). Costs ${money(cost30)}, profit ${money(total30 - cost30)}.`,
    ...rows.map((r) => `  ${r.label}: ${money(r.d7)} (7d), ${money(r.d30)} (30d)${r.note ? `, ${r.note}` : ""}`),
    ...bySite.flatMap(({ name, groups }) => [
      `  ${name} by site, 30 days:`,
      ...groups.flatMap((g) => [
        `    ${g.label}: ${money(g.cents)} from ${g.sales} sale${g.sales === 1 ? "" : "s"}`,
        ...(g.key ? [] : g.tags.slice(0, 3).map((t) => `      ${t.tag}: ${money(t.cents)} from ${t.sales}`)),
      ]),
    ]),
    ...(off.length ? [`  Not connected: ${off.join(", ")}.`] : []),
    `  Earnings: ${adminUrl}`,
  ].join("\n");

  return { html, text };
}

/** What the digest says when the sources could not be loaded in time. */
export const EARNINGS_UNAVAILABLE: EarningsDigest = {
  html: `<tr><td style="padding:18px 32px 4px;font-size:13px;color:#6b7585">Money: the earnings sources did not answer in time this week. Open /admin/earnings for the figures.</td></tr>`,
  text: "MONEY\n  The earnings sources did not answer in time this week. Open /admin/earnings for the figures.",
};

/** Puts the money section where the monitor left its marker; a mail without the marker is returned unchanged. */
export function fillEarnings(mail: { html: string; text?: string }, block: EarningsDigest): { html: string; text?: string } {
  return {
    html: mail.html.split(EARNINGS_MARKER).join(block.html),
    text: mail.text === undefined ? undefined : mail.text.split(EARNINGS_MARKER_TEXT).join(block.text),
  };
}
