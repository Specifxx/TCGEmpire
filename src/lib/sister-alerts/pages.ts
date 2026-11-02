// The few HTML pages the alert emails link to (confirm, manage), served by
// route handlers under /api/sister-alerts. Every change is a POST from a
// button on the page, never a GET: mail scanners open links, and must not
// confirm or stop an alert by doing so.
import { escapeHtml } from "../email";
import { money } from "./email";
import { sisterSite, type SisterRegion } from "./sites";

export function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#f4f5f7;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#111827}main{max-width:560px;margin:40px auto;padding:0 16px}.card{background:#fff;border:1px solid #e3e6ea;border-radius:14px;padding:22px}h1{font-size:20px;margin:0 0 10px}p{line-height:1.6;color:#374151}button{font:inherit;font-weight:700;border:0;border-radius:9px;padding:10px 18px;background:#111827;color:#fff;cursor:pointer}button.ghost{background:#fff;color:#b91c1c;border:1px solid #e5e7eb;padding:6px 12px;font-weight:600}ul{list-style:none;padding:0;margin:14px 0}li{display:flex;gap:12px;justify-content:space-between;align-items:center;border-top:1px solid #eef0f2;padding:10px 0}small{color:#6b7280}a{color:#1d4ed8}</style></head>
<body><main><div class="card">${body}</div><p><small>Price alerts for the Compare Empire sites, run by riftcompare.com.</small></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export const hidden = (name: string, value: string) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;

export interface ListedAlert {
  id: string;
  site: string;
  productId: string;
  region: string;
  targetCents: number;
  name: string | null;
  path: string | null;
}

export function alertLabel(a: ListedAlert): string {
  const site = sisterSite(a.site);
  const name = a.name ?? `Product ${a.productId}`;
  const link = site && a.path ? `<a href="${escapeHtml(new URL(a.path, site.url).toString())}">${escapeHtml(name)}</a>` : escapeHtml(name);
  return `${link}<br><small>${escapeHtml(site?.name ?? a.site)} · ${escapeHtml(a.region)} · ${escapeHtml(money(a.targetCents, a.region as SisterRegion))} or less</small>`;
}

export const badLink = () => page("Link not found", `<h1>That link has expired</h1><p>It may be from an alert you already stopped. You can set a new one on any of our sites.</p>`, 404);
