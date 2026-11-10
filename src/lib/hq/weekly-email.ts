// THE ONE MONDAY REPORT (owner, 2026-11-02: "one Monday email" instead of the
// health digest, the growth report and each site's own mail). Built and sent by
// the site (/api/cron/weekly-report), which alone holds the reporting keys, so no
// amount ever reaches a public log. To the owner and the business inbox the weekly
// growth review reads. DECISIONS.md, "Empire HQ and the one Monday report".
//
// PURE: every dynamic string is escaped; the text part carries the same content.
import { emailShell, escapeHtml as esc } from "../email";
import { formatMoney } from "../format";
import { SEVERITY_RANK, type CheckResult, type Severity } from "../ops/types";
import type { Hq } from "./load";
import { pctChange, type Week } from "./view";
import { GROWTH_TARGETS } from "../admin-growth";
import { paidPer100, type SearchTest } from "../earnings/search-test";
import type { NetworkCounts } from "../analytics/click-networks";

export const WEEKLY_SUBJECT_PREFIX = "Empire weekly";

const COLOR: Record<Severity, string> = { ok: "#34d17e", warn: "#eab308", crit: "#ef4444", unknown: "#6b7585" };
const WORD: Record<Severity, string> = { ok: "OK", warn: "Heads up", crit: "Needs action", unknown: "Not checked" };
const money = (c: number | null) => (c == null ? "–" : formatMoney(c, "AUD"));
const n = (v: number | null) => (v == null ? "–" : v.toLocaleString("en-US"));
const pct = (p: number | null) => (p == null ? "" : `${p > 0 ? "+" : ""}${p}%`);
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;

function targetLine(label: string, w: Week, target: number): { text: string; met: boolean | null } {
  const met = w.last7 == null || w.prev7 == null ? null : w.last7 >= w.prev7 * (1 + target / 100);
  const goal = target === 0 ? "hold" : `+${target}%`;
  return { text: `${label}: ${n(w.last7)} Google clicks vs ${n(w.prev7)} (${pct(pctChange(w)) || "no change data"}; target ${goal})`, met };
}

export interface WeeklyInput {
  hq: Hq;
  /** RiftCompare's own checks (its monitor's latest report). */
  riftChecks: readonly CheckResult[];
  /** The money section (lib/earnings/digest.ts), already built. */
  money: { html: string; text: string };
  /** The growth review's detail (lib/earnings/growth-report.ts growthReportText), or null. */
  growthText: string | null;
  siteUrl: string;
  today: string;
  /** Per site key, the last 7 days' visitors (daily, summed) and buy_click events (Vercel Web Analytics); null when not read. */
  buyClicks?: ReadonlyMap<string, { visitors: number; clicks: number }> | null;
  /** Per site key, the same week's buy clicks to TCGplayer, eBay, Amazon and joined Awin stores (lib/analytics/click-networks.ts); null when not read. */
  networks?: ReadonlyMap<string, NetworkCounts> | null;
  /** The compare search test (to the 8 Dec gate): stored analytics and ce-search/ce-mcp eBay earnings, AUD cents. */
  search?: { test: SearchTest | null; earned: { d7: number; d30: number } } | null;
  /** Bing, every site (lib/hq/bing.ts bingLines), or empty. */
  bing?: readonly string[];
}

/** The compare search test's lines, plain text (the HTML part escapes them). Pure. */
export function searchTestLines(search: WeeklyInput["search"]): string[] {
  if (!search) return [];
  const t = search.test;
  if (!t) return ["Not collected yet (the earnings refresh reads it every three hours)."];
  const w = t.d7;
  const per = paidPer100(w);
  const lines = [
    `Last 7 days: ${n(w.searches)} searches (${n(w.empty)} found nothing), ${n(w.resultClicks)} result clicks, ${n(w.paidClicks)} paid eBay clicks${per == null ? "" : ` (${per} per 100 searches)`}, earned ${money(search.earned.d7)}.`,
    `Last 30 days: ${n(t.d30.searches)} searches, ${n(t.d30.paidClicks)} paid clicks, earned ${money(search.earned.d30)}.`,
  ];
  if (t.bySite.length) lines.push(`Sent by: ${t.bySite.slice(0, 8).map((b) => `${b.from} ${b.count}`).join(", ")}.`);
  if (t.noResult.length) lines.push(`Most searched, not found: ${t.noResult.slice(0, 10).map((r) => `“${r.q}” ${r.count}`).join(", ")}.`);
  return lines;
}

/** "84 · 3.1/100" — buy clicks, and per 100 visitors (site review X6, 2026-11-10). */
export function buyCell(b: { visitors: number; clicks: number } | undefined): string {
  if (!b || (!b.visitors && !b.clicks)) return "–";
  return b.visitors ? `${b.clicks.toLocaleString("en-US")} · ${((b.clicks / b.visitors) * 100).toFixed(1)}/100` : b.clicks.toLocaleString("en-US");
}

/** "TCG 12 · eBay 30 · Amz 4 · Awin 0 (46%)": buy clicks to the networks that pay, and their share of all buy clicks (2026-11-10). */
export function paidCell(c: NetworkCounts | undefined, total: number | undefined): string {
  if (!c) return "–";
  const paid = c.tcgplayer + c.ebay + c.amazon + c.awin;
  if (!paid && !total) return "–";
  const share = total ? ` (${Math.round((Math.min(paid, total) / total) * 100)}%)` : "";
  return `TCG ${c.tcgplayer.toLocaleString("en-US")} · eBay ${c.ebay.toLocaleString("en-US")} · Amz ${c.amazon.toLocaleString("en-US")} · Awin ${c.awin.toLocaleString("en-US")}${share}`;
}

/** Daily visitors summed over the week. */
export const visitorsCell = (b: { visitors: number } | undefined) => (b && b.visitors ? b.visitors.toLocaleString("en-US") : "–");

/** Each site's visitors and buy clicks over [from, to] (inclusive days), from loadBuyClickCounts' days. */
export function buyClicksBySite(sites: readonly { key: string; days: readonly { day: string; visitors: number; clicks: number }[] }[], from: string, to: string): Map<string, { visitors: number; clicks: number }> {
  const out = new Map<string, { visitors: number; clicks: number }>();
  for (const s of sites) {
    const t = { visitors: 0, clicks: 0 };
    for (const d of s.days) if (d.day >= from && d.day <= to) (t.visitors += d.visitors), (t.clicks += d.clicks);
    out.set(s.key, t);
  }
  return out;
}

export function buildWeeklyEmail(x: WeeklyInput): { subject: string; html: string; text: string } {
  const { hq } = x;
  const hqUrl = `${x.siteUrl}/admin/hq`;
  const red = hq.rows.filter((r) => r.health.severity === "crit");
  const amber = hq.rows.filter((r) => r.health.severity === "warn");
  const open = hq.steps.filter((s) => !s.doneAt);
  const targets = [
    targetLine("Sister sites", hq.totals.sisters, GROWTH_TARGETS.sisters.pct),
    targetLine("RiftCompare", hq.totals.rift, GROWTH_TARGETS.rift.pct),
    targetLine("Every site", hq.totals.all, GROWTH_TARGETS.family.pct),
  ];

  const bits = [red.length ? `${plural(red.length, "site")} need action` : amber.length ? `${plural(amber.length, "site")} to watch` : "all sites healthy", open.length ? `${plural(open.length, "step")} for you` : ""].filter(Boolean);
  const subject = `${WEEKLY_SUBJECT_PREFIX} ${x.today}: ${bits.join(", ")}`;

  const h = "padding:14px 32px 4px;font-size:11px;font-weight:700;color:#6b7585;text-transform:uppercase;letter-spacing:.06em";
  const cell = "padding:4px 6px;font-size:12px;color:#b8c0cc;border-bottom:1px solid #1b2433;vertical-align:top";
  const num = `${cell};text-align:right;white-space:nowrap`;
  const head = "padding:4px 6px;font-size:10px;color:#6b7585;text-transform:uppercase;letter-spacing:.05em";

  let inner = `<tr><td style="padding:8px 32px 2px;font-size:14px;line-height:1.6;color:#e6ebf2">${targets
    .map((t) => `<div><span style="color:${t.met == null ? "#6b7585" : t.met ? "#34d17e" : "#ef4444"}">${t.met == null ? "•" : t.met ? "✓" : "✗"}</span> ${esc(t.text)}</div>`)
    .join("")}</td></tr>`;

  // Needs you: open steps first, they are the one thing only the owner can do.
  inner += `<tr><td style="${h}">Needs you this week</td></tr>`;
  inner += open.length
    ? `<tr><td style="padding:2px 32px;font-size:13px;line-height:1.55;color:#b8c0cc">${open
        .map((s) => `<div style="margin:4px 0">☐ <strong style="color:#e6ebf2">${esc(s.title)}</strong>${s.why ? ` — ${esc(s.why)}` : ""}${s.prompt ? `<br/><span style="font-size:12px;color:#6b7585">Chrome prompt: project files › ${esc(s.prompt)}</span>` : ""}</div>`)
        .join("")}<div style="margin-top:6px;font-size:12px;color:#6b7585">These are joined into one Chrome batch each Monday. Press Done on <a href="${esc(hqUrl)}#steps" style="color:#f29733">Empire HQ</a> when finished.</div></td></tr>`
    : `<tr><td style="padding:2px 32px;font-size:13px;color:#b8c0cc">Nothing. Every step is done.</td></tr>`;

  // One row per site.
  inner += `<tr><td style="${h}">Every site, last 7 days${hq.gscEnd ? ` (Google to ${esc(hq.gscEnd)})` : ""}</td></tr>`;
  inner += `<tr><td style="padding:2px 26px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="${head}">Site</td><td style="${head};text-align:right">Clicks</td><td style="${head};text-align:right">Earned</td>${x.buyClicks ? `<td style="${head};text-align:right">Visitors</td><td style="${head};text-align:right">Buy clicks</td>` : ""}${x.networks ? `<td style="${head};text-align:right">To who pays</td>` : ""}<td style="${head}">Health</td></tr>`;
  for (const r of hq.rows) {
    const mark = r.met == null ? "" : r.met ? ` <span style="color:#34d17e">✓</span>` : ` <span style="color:#ef4444">✗</span>`;
    const top = r.health.problems[0];
    inner += `<tr><td style="${cell}"><strong style="color:#e6ebf2">${esc(r.site.label)}</strong></td><td style="${num}">${n(r.clicks.last7)} <span style="color:#6b7585">${esc(pct(r.clicksPct))}</span>${mark}</td><td style="${num}">${esc(money(r.earned.last7))}</td>${x.buyClicks ? `<td style="${num}">${esc(visitorsCell(x.buyClicks.get(r.site.key)))}</td><td style="${num}">${esc(buyCell(x.buyClicks.get(r.site.key)))}</td>` : ""}${x.networks ? `<td style="${num}">${esc(paidCell(x.networks.get(r.site.key), x.buyClicks?.get(r.site.key)?.clicks))}</td>` : ""}<td style="${cell}"><span style="color:${COLOR[r.health.severity]}">●</span> ${esc(top ? `${top.name}: ${top.detail}` : r.health.summary)}</td></tr>`;
  }
  inner += `</table></td></tr>`;
  inner += `<tr><td style="padding:4px 32px;font-size:11px;color:#6b7585">Clicks: Google, this week vs last (✓ met the target: sisters +${GROWTH_TARGETS.sisters.pct}%, RiftCompare hold). Earned: eBay and TCGplayer by tag, Stripe and ads on RiftCompare, AUD incl. pending.${x.buyClicks ? " Visitors: daily visitors summed (Vercel Web Analytics). Buy clicks: visitors leaving for a store, eBay, TCGplayer or Amazon (Vercel buy_click events), and per 100 visitors." : ""}${x.networks ? " To who pays: those clicks to TCGplayer, eBay, Amazon and the stores we joined on Awin, and their share; the rest went to stores that pay us nothing." : ""}${hq.costsConnected ? "" : " Vercel cost per site is not connected yet."}</td></tr>`;

  const flagged = x.riftChecks.filter((r) => SEVERITY_RANK[r.severity] > 0 && r.area !== "sites");
  if (flagged.length) {
    inner += `<tr><td style="${h}">RiftCompare checks flagged</td></tr>`;
    inner += `<tr><td style="padding:2px 32px;font-size:13px;line-height:1.5;color:#b8c0cc">${flagged.map((r) => `<div style="margin:3px 0"><span style="color:${COLOR[r.severity]}">●</span> <strong style="color:#e6ebf2">${esc(r.title)}</strong> — ${esc(r.summary)}</div>`).join("")}</td></tr>`;
  }
  const bingLines = x.bing ?? [];
  if (bingLines.length) {
    inner += `<tr><td style="${h}">Bing, pages indexed per site</td></tr>`;
    inner += `<tr><td style="padding:2px 32px;font-size:13px;line-height:1.55;color:#b8c0cc">${bingLines.map((l) => `<div style="margin:3px 0">${esc(l)}</div>`).join("")}</td></tr>`;
  }
  const searchLines = searchTestLines(x.search);
  if (searchLines.length) {
    inner += `<tr><td style="${h}">Compare search test (gate 8 Dec)</td></tr>`;
    inner += `<tr><td style="padding:2px 32px;font-size:13px;line-height:1.55;color:#b8c0cc">${searchLines.map((l) => `<div style="margin:3px 0">${esc(l)}</div>`).join("")}</td></tr>`;
  }
  inner += x.money.html;
  if (x.growthText) {
    inner += `<tr><td style="${h}">Growth review detail</td></tr>`;
    inner += `<tr><td style="padding:2px 32px"><pre style="margin:0;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;color:#b8c0cc">${esc(x.growthText)}</pre></td></tr>`;
  }
  if (hq.errors.length) inner += `<tr><td style="padding:10px 32px 2px;font-size:11px;color:#6b7585">${hq.errors.map(esc).join(" ")}</td></tr>`;
  inner += `<tr><td style="padding:14px 32px 22px"><a href="${esc(hqUrl)}" style="display:inline-block;background:#ef7d00;color:#1e3043;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Open Empire HQ →</a></td></tr>`;

  const footer = `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;line-height:1.6;color:#6b7585">The one Monday report for every Compare Empire site. Red problems are still emailed the moment they happen; everything else waits for this. If it ever does not arrive on a Monday, the monitor has stopped.</td></tr>`;

  const text = [
    ...targets.map((t) => `${t.met == null ? "•" : t.met ? "✓" : "✗"} ${t.text}`),
    "",
    "NEEDS YOU THIS WEEK",
    ...(open.length ? open.map((s) => `  [ ] ${s.title}${s.why ? ` — ${s.why}` : ""}${s.prompt ? `\n      Chrome prompt: project files > ${s.prompt}` : ""}`) : ["  Nothing."]),
    "",
    `EVERY SITE, LAST 7 DAYS${hq.gscEnd ? ` (Google to ${hq.gscEnd})` : ""}`,
    ...hq.rows.map((r) => {
      const top = r.health.problems[0];
      return `  ${r.site.label}: ${n(r.clicks.last7)} clicks ${pct(r.clicksPct)}${r.met == null ? "" : r.met ? " ✓" : " ✗"} · ${money(r.earned.last7)}${x.buyClicks ? ` · visitors ${visitorsCell(x.buyClicks.get(r.site.key))} · buy clicks ${buyCell(x.buyClicks.get(r.site.key))}` : ""}${x.networks ? ` · to who pays ${paidCell(x.networks.get(r.site.key), x.buyClicks?.get(r.site.key)?.clicks)}` : ""} · [${WORD[r.health.severity]}] ${top ? `${top.name}: ${top.detail}` : r.health.summary}`;
    }),
    ...(flagged.length ? ["", "RIFTCOMPARE CHECKS FLAGGED", ...flagged.map((r) => `  [${WORD[r.severity]}] ${r.title}: ${r.summary}`)] : []),
    ...(bingLines.length ? ["", "BING, PAGES INDEXED PER SITE", ...bingLines.map((l) => `  ${l}`)] : []),
    ...(searchLines.length ? ["", "COMPARE SEARCH TEST (GATE 8 DEC)", ...searchLines.map((l) => `  ${l}`)] : []),
    "",
    x.money.text,
    ...(x.growthText ? ["", "GROWTH REVIEW DETAIL", x.growthText] : []),
    ...(hq.errors.length ? ["", ...hq.errors] : []),
    "",
    `Empire HQ: ${hqUrl}`,
  ].join("\n");

  return { subject, html: emailShell("Empire weekly", inner, footer, bits.join(", ")), text };
}
