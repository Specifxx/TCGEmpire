import { prisma } from "@/lib/db";
import { escapeHtml } from "@/lib/email";
import { giftBrand } from "@/lib/premium-gift-pass-server";
import { GIFT_FEATURES } from "@/lib/premium-gift-pass";

// The 3-day pass email's opt-out (lib/premium-gift-pass.ts). It writes the same AnnouncementOptOut row every Premium and
// announcement email reads, so one click stops them all. A plain page in the member's OWN site's name, outside the site
// layout, so a DexCompare member never sees RiftCompare (owner, 2026-11-25). GET only shows a confirm button (a link scanner that
// opens the URL must not opt anyone out); the button and RFC 8058 one-click both POST.
export const dynamic = "force-dynamic";

async function optOut(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const row = await prisma.announcementOptOut.findUnique({ where: { token } }).catch(() => null);
  if (!row) return false;
  if (!row.optedOutAt) await prisma.announcementOptOut.update({ where: { token }, data: { optedOutAt: new Date() } }).catch(() => {});
  return true;
}

type State = "ask" | "done" | "bad";

function page(site: string, state: State, token = ""): Response {
  const key = GIFT_FEATURES[site] ? site : "rift";
  const b = giftBrand(key);
  const color = b.color ?? "#1ea65c";
  const action = `?token=${encodeURIComponent(token)}&site=${encodeURIComponent(key)}`;
  const body =
    state === "ask"
      ? `<h1>Unsubscribe from ${escapeHtml(b.name)} news?</h1><p>You won't get news or offers from ${escapeHtml(b.name)} again. Price alerts you set yourself and sign-in links still arrive.</p><form method="post" action="${escapeHtml(action)}"><button type="submit">Unsubscribe</button></form>`
      : state === "done"
        ? `<h1>You're unsubscribed</h1><p>${escapeHtml(b.name)} won't send you news or offers again. Price alerts you set yourself and sign-in links still arrive.</p>`
        : `<h1>Link not recognised</h1><p>This link is invalid. Reply to any of our emails and we'll take you off by hand.</p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(b.name)}</title>
<style>body{margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#374151}main{max-width:460px;margin:60px auto;padding:28px;background:#fff;border:1px solid #e3e6ea;border-radius:14px}.b{font-weight:800;font-size:20px;color:${color}}h1{font-size:20px;color:#111827}a{color:${color};font-weight:700}button{background:${color};color:#fff;border:0;border-radius:9px;padding:11px 20px;font-weight:700;font-size:15px;cursor:pointer}</style></head>
<body><main><div class="b">${escapeHtml(b.name)}</div>${body}<p><a href="${escapeHtml(b.url)}">Back to ${escapeHtml(b.name)}</a></p></main></body></html>`;
  return new Response(html, { status: state === "bad" ? 400 : 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const token = p.get("token") ?? "";
  const known = token && token.length <= 100 ? await prisma.announcementOptOut.findUnique({ where: { token }, select: { token: true } }).catch(() => null) : null;
  return page(p.get("site") ?? "rift", known ? "ask" : "bad", token);
}

export async function POST(req: Request) {
  const p = new URL(req.url).searchParams;
  return page(p.get("site") ?? "rift", (await optOut(p.get("token") ?? "")) ? "done" : "bad");
}
