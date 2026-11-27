import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { escapeHtml } from "@/lib/email";
import { giftBrand } from "@/lib/premium-gift-pass-server";
import { GIFT_FEATURES } from "@/lib/premium-gift-pass";

// The 3-day pass email's opt-out (lib/premium-gift-pass.ts). It writes the same AnnouncementOptOut row every Premium and
// announcement email reads, so one click stops them all. A plain page in the member's OWN site's name, outside the site
// layout, so a DexCompare member never sees RiftCompare (owner, 2026-11-25). GET for the link, POST for RFC 8058 one-click.
export const dynamic = "force-dynamic";

async function optOut(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const row = await prisma.announcementOptOut.findUnique({ where: { token } }).catch(() => null);
  if (!row) return false;
  if (!row.optedOutAt) await prisma.announcementOptOut.update({ where: { token }, data: { optedOutAt: new Date() } }).catch(() => {});
  return true;
}

function page(site: string, ok: boolean): Response {
  const b = giftBrand(GIFT_FEATURES[site] ? site : "rift");
  const color = b.color ?? "#1ea65c";
  const body = ok
    ? `<h1>You're unsubscribed</h1><p>${escapeHtml(b.name)} won't send you news or offers again. Price alerts you set yourself and sign-in links still arrive.</p>`
    : `<h1>Link not recognised</h1><p>This link is invalid. Reply to any of our emails and we'll take you off by hand.</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(b.name)}</title>
<style>body{margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#374151}main{max-width:460px;margin:60px auto;padding:28px;background:#fff;border:1px solid #e3e6ea;border-radius:14px}.b{font-weight:800;font-size:20px;color:${color}}h1{font-size:20px;color:#111827}a{color:${color};font-weight:700}</style></head>
<body><main><div class="b">${escapeHtml(b.name)}</div>${body}<p><a href="${escapeHtml(b.url)}">Back to ${escapeHtml(b.name)}</a></p></main></body></html>`;
  return new Response(html, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return page(p.get("site") ?? "rift", await optOut(p.get("token") ?? ""));
}

export async function POST(req: Request) {
  const ok = await optOut(new URL(req.url).searchParams.get("token") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
