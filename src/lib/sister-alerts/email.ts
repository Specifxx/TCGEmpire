// The two emails the shared alert service sends for a sister site: the
// double opt-in confirmation and the price alert. Branded as the SISTER site
// (its name and colour), sent from RiftCompare's verified domain, and saying so
// in the footer. Every product name, path and deal comes from the site's own
// feed; the confirmation carries nothing a form typed but the numbers.
import { escapeHtml } from "../email";
import { SITE_URL } from "../site";
import { REGION_CURRENCY, sisterSite, type SisterAlertSite, type SisterRegion } from "./sites";
import type { FeedDeal } from "./feed";

const LOCALE: Record<SisterRegion, string> = { US: "en-US", UK: "en-GB", CA: "en-CA", AU: "en-AU", NZ: "en-NZ", EU: "en-IE", SG: "en-SG" };
const REGION_LABEL: Record<SisterRegion, string> = { US: "US", UK: "UK", CA: "Canadian", AU: "Australian", NZ: "NZ", EU: "EU", SG: "Singapore" };

export function money(cents: number, region: SisterRegion): string {
  const cur = REGION_CURRENCY[region];
  const s = new Intl.NumberFormat(LOCALE[region], { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(cents / 100);
  // "$" alone is ambiguous across US/CA/AU/NZ/SG: prefix the country, as the sites do.
  if (cur === "USD") return `US${s}`;
  if (cur === "CAD") return `CA${s}`;
  if (cur === "AUD") return `A${s}`;
  if (cur === "NZD") return `NZ${s}`;
  if (cur === "SGD") return `S${s}`;
  return s;
}

export const serviceUrl = (path: string, token: string) => `${SITE_URL}/api/sister-alerts/${path}?t=${encodeURIComponent(token)}`;

/** A site link with the alert's attribution. */
export function siteLink(site: SisterAlertSite, path: string, campaign: string): string {
  const u = new URL(path, site.url);
  u.searchParams.set("utm_source", "alert-email");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

function shell(site: SisterAlertSite, heading: string, inner: string, footer: string, preheader: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 8px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e3e6ea;border-radius:14px">
      <tr><td style="padding:24px 28px 4px;font-size:20px;font-weight:800;color:${site.color}">${escapeHtml(site.name)}</td></tr>
      <tr><td style="padding:6px 28px 4px"><h1 style="margin:0;font-size:19px;line-height:1.3;color:#111827">${heading}</h1></td></tr>
      ${inner}
      ${footer}
    </table></td></tr></table></body></html>`;
}

const button = (site: SisterAlertSite, href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${site.color};color:#ffffff;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:9px">${escapeHtml(label)}</a>`;

export interface BuiltMail {
  subject: string;
  html: string;
  text: string;
}

export function buildConfirmEmail(siteKey: string, token: string, targetCents: number, region: SisterRegion): BuiltMail {
  const site = sisterSite(siteKey)!;
  const url = serviceUrl("confirm", token);
  const target = money(targetCents, region);
  const subject = `Confirm your ${site.name} price alert`;
  const inner = `
    <tr><td style="padding:8px 28px 6px;font-size:14px;line-height:1.6;color:#374151">Someone, hopefully you, asked ${escapeHtml(site.name)} to email this address when a product drops to ${escapeHtml(target)} or less at ${REGION_LABEL[region]} stores. Confirm and we'll start checking prices every day.</td></tr>
    <tr><td style="padding:10px 28px 18px">${button(site, url, "Confirm my price alert")}</td></tr>
    <tr><td style="padding:0 28px 18px;font-size:13px;line-height:1.6;color:#6b7280">You only confirm once: alerts you add later on any of our sites start straight away. If you didn't ask for this, ignore this email and nothing will be sent.</td></tr>`;
  const footer = `<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">${escapeHtml(site.name)} price alerts are sent by the Compare Empire alert service at riftcompare.com.</td></tr>`;
  const text = `${subject}\n\nSomeone, hopefully you, asked ${site.name} to email this address when a product drops to ${target} or less at ${REGION_LABEL[region]} stores.\n\nConfirm: ${url}\n\nIf you didn't ask for this, ignore this email and nothing will be sent.`;
  return { subject, html: shell(site, "Confirm your price alert", inner, footer, `One click and we'll watch the price for you.`), text };
}

export interface FiredAlert {
  id: string;
  site: string;
  name: string;
  path: string;
  region: SisterRegion;
  priceCents: number;
  targetCents: number;
}

export interface DealPick {
  site: SisterAlertSite;
  deal: FeedDeal;
}

function friendLink(site: SisterAlertSite, a: FiredAlert): string {
  const subject = `${a.name} is down to ${money(a.priceCents, a.region)}`;
  const body = `Thought you'd want this: ${a.name} is ${money(a.priceCents, a.region)} on ${site.name}.\n\n${siteLink(site, a.path, "alert-share")}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** One email per address per run: every alert of one site that fired, plus at most one deal from a sister of the same group. */
export function buildAlertEmail(siteKey: string, fired: FiredAlert[], token: string, deal: DealPick | null): BuiltMail {
  const site = sisterSite(siteKey)!;
  const rows = fired.slice(0, 10);
  const first = rows[0]!;
  const subject =
    rows.length === 1
      ? `Price drop: ${first.name} is now ${money(first.priceCents, first.region)}`
      : `${rows.length} of your ${site.name} price alerts hit their target`;
  const items = rows
    .map((a) => {
      const link = siteLink(site, a.path, "sister-alert");
      return `<tr><td style="padding:10px 28px 4px">
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px">
          <div style="font-size:15px;font-weight:700;color:#111827">${escapeHtml(a.name)}</div>
          <div style="margin-top:4px;font-size:14px;color:#374151">Now <strong style="color:#047857">${escapeHtml(money(a.priceCents, a.region))}</strong> at ${REGION_LABEL[a.region]} stores · your alert: ${escapeHtml(money(a.targetCents, a.region))} or less</div>
          <div style="margin-top:10px">${button(site, link, "Compare store prices")}</div>
          <div style="margin-top:8px;font-size:12px"><a href="${escapeHtml(friendLink(site, a))}" style="color:#4b5563">Send this to a friend</a> · <a href="${escapeHtml(serviceUrl("manage", token) + `&stop=${encodeURIComponent(a.id)}`)}" style="color:#4b5563">Stop this alert</a></div>
        </div></td></tr>`;
    })
    .join("");
  const dealHtml = deal
    ? `<tr><td style="padding:14px 28px 4px">
        <div style="background:#f9fafb;border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.55;color:#374151">
          <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">A deal on ${escapeHtml(deal.site.name)}, our sister site</div>
          <a href="${escapeHtml(siteLink(deal.site, deal.deal.u, `sister-deal-from-${site.key}`))}" style="color:#111827;font-weight:700;text-decoration:none">${escapeHtml(deal.deal.n)}</a>
          · ${escapeHtml(money(deal.deal.p, deal.deal.r))}${deal.deal.ref && deal.deal.refLabel ? ` (${escapeHtml(deal.deal.refLabel)} ${escapeHtml(money(deal.deal.ref, deal.deal.r))})` : ""}
        </div></td></tr>`
    : "";
  const note = `<tr><td style="padding:10px 28px 16px;font-size:12px;line-height:1.6;color:#6b7280">Prices are the lowest in-stock store price we saw today, before postage. Stores change prices quickly, so check before you buy.</td></tr>`;
  const footer = `<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">You're getting this because you set a price alert on ${escapeHtml(site.name)}. <a href="${escapeHtml(serviceUrl("manage", token))}" style="color:#4b5563">Manage your alerts</a> · <a href="${escapeHtml(serviceUrl("manage", token) + "&stop=all")}" style="color:#4b5563">Unsubscribe from all</a><br/>Sent by the Compare Empire alert service at riftcompare.com.</td></tr>`;
  const text = [
    subject,
    "",
    ...rows.map((a) => `${a.name}: now ${money(a.priceCents, a.region)} (your alert: ${money(a.targetCents, a.region)} or less)\n${siteLink(site, a.path, "sister-alert")}`),
    deal ? `\nA deal on ${deal.site.name}: ${deal.deal.n}, ${money(deal.deal.p, deal.deal.r)}\n${siteLink(deal.site, deal.deal.u, `sister-deal-from-${site.key}`)}` : "",
    `\nManage or stop your alerts: ${serviceUrl("manage", token)}`,
  ].join("\n");
  const heading = rows.length === 1 ? "Your price alert hit its target" : `${rows.length} price alerts hit their target`;
  return { subject, html: shell(site, heading, items + dealHtml + note, footer, `${first.name}: ${money(first.priceCents, first.region)}`), text };
}

/** RFC 8058 one-click unsubscribe headers. */
export function listUnsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${serviceUrl("unsubscribe", token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** "MTG Compare alerts <noreply@riftcompare.com>": the sister's name on RiftCompare's verified sender. */
export function fromFor(site: SisterAlertSite, env: Record<string, string | undefined> = process.env): string {
  const raw = env.EMAIL_FROM ?? "noreply@riftcompare.com";
  const addr = /<([^>]+)>/.exec(raw)?.[1] ?? raw.trim();
  return `${site.name} alerts <${addr}>`;
}
