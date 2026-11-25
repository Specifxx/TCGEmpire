import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin-emails";
import { escapeHtml, sendEmail } from "@/lib/email";
import {
  EMAIL_SHAPE,
  memberFor,
  sisterSignupSource,
  premiumSiteForOrigin,
  signEmailLinkCode,
  signPremiumSession,
  verifyEmailLinkCode,
  verifyPremiumSession,
  type PremiumSite,
} from "@/lib/sister-premium";
import { giveawayFor, type GiveawaySite } from "@/lib/giveaway";
import { accountByEmail, giveawayAction, myGiveaway } from "@/lib/giveaway-server";
import { entryMilestone as milestone } from "@/lib/giveaway-run";

export const dynamic = "force-dynamic";

// A sister site's giveaway entry box (DexCompare, MTG Compare, YGO Compare, OP Compare; lib/giveaway.ts). Called from the sister's
// browser only (exact-origin CORS) with the premium-session token RiftCompare signed for that site (lib/sister-premium.ts). The
// site's giveaway is the one lib/giveaway.ts lists for it. { token } answers the account's points; with { action } it acts first.
//
// OP Compare has its own accounts, not RiftCompare's sister Premium (2026-11-22), so its giveaway page signs in here, for the
// giveaway only: { method: "email", email } mails a 20-minute link to opcompare.app/giveaway#c=<code>, and { code } turns that
// proof of the inbox into the RiftCompare account for the address (memberFor) and a premium-session token for OP, which the page
// keeps. Nothing about OP's own account is read or changed.
const SITES: GiveawaySite[] = ["dex", "mtg", "ygo", "op"];
const OP_SITE: PremiumSite = { key: "op", name: "OP Compare", url: "https://opcompare.app" };

function siteFor(origin: string | null): PremiumSite | null {
  const s = premiumSiteForOrigin(origin);
  if (s) return s;
  if (!origin) return null;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && !u.port && u.hostname.toLowerCase().replace(/^www\./, "") === "opcompare.app" ? OP_SITE : null;
  } catch {
    return null;
  }
}

function cors(origin: string | null): Record<string, string> {
  if (!origin || !siteFor(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: siteFor(origin) ? 204 : 403, headers: cors(origin) });
}

async function mailLink(site: PremiumSite, email: string): Promise<boolean> {
  const url = `${site.url}/giveaway#c=${encodeURIComponent(await signEmailLinkCode(site, email))}`;
  const raw = process.env.EMAIL_FROM ?? "noreply@riftcompare.com";
  const addr = /<([^>]+)>/.exec(raw)?.[1] ?? raw.trim();
  const line = `Tap the button to confirm your email and enter the ${site.name} giveaway. The link lasts 20 minutes.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 8px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px">
<tr><td style="padding:26px 28px 4px;font-size:20px;font-weight:800;color:#111827">${escapeHtml(site.name)} giveaway</td></tr>
<tr><td style="padding:8px 28px 14px;font-size:14px;line-height:1.6;color:#374151">${escapeHtml(line)}</td></tr>
<tr><td style="padding:4px 28px 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#111827;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Confirm and enter</a></td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">If you didn't ask for this, you can ignore this email.<br/>The draw is run for ${escapeHtml(site.name)} by its sister site RiftCompare (riftcompare.com).</td></tr>
</table></td></tr></table></body></html>`;
  return sendEmail(email, `Confirm your ${site.name} giveaway entry`, html, {
    text: `${line}\n\nConfirm: ${url}\n\nIf you didn't ask for this, you can ignore this email.\n`,
    from: `${site.name} <${addr}>`,
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Cache-Control": "no-store" };
  const site = siteFor(origin);
  const key = site && (SITES as string[]).includes(site.key) ? (site.key as GiveawaySite) : null;
  if (!site || !key) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  if (!rateLimit(`sister-giveaway:${clientIp(req)}`, 40, 60_000).ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
  const g = giveawayFor(key, new Date());
  if (!g) return NextResponse.json({ error: "No giveaway here yet." }, { status: 404, headers });
  const body = (await req.json().catch(() => null)) as
    | { token?: unknown; action?: unknown; showName?: unknown; ref?: unknown; method?: unknown; email?: unknown; code?: unknown }
    | null;

  try {
    // OP Compare's own sign-in for the giveaway (see the top of this file).
    if (site === OP_SITE && body?.method === "email") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_SHAPE.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers });
      if (!rateLimit(`sister-giveaway-link:${email}`, 3, 60 * 60_000).ok || !rateLimit(`sister-giveaway-link-ip:${clientIp(req)}`, 6, 60 * 60_000).ok) {
        return NextResponse.json({ error: "We just sent you a link. Check your inbox (and spam)." }, { status: 429, headers });
      }
      if (!(await mailLink(site, email))) return NextResponse.json({ error: "We couldn't send the email. Try again in a minute." }, { status: 502, headers });
      return NextResponse.json({ ok: true, sent: true }, { headers });
    }
    let token = typeof body?.token === "string" ? body.token : null;
    if (site === OP_SITE && body?.code !== undefined) {
      const proved = await verifyEmailLinkCode(body.code, site);
      if (!proved) return NextResponse.json({ error: "That link has expired. Ask for a new one." }, { status: 401, headers });
      const m = await memberFor(proved.trim().toLowerCase(), null, sisterSignupSource(site.key, "giveaway"));
      token = await signPremiumSession(site, m.email);
    }
    const email = await verifyPremiumSession(token, site);
    if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    const user = await accountByEmail(email);
    if (!user) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    if (body?.action !== undefined) {
      const r = await giveawayAction(g, user, body.action, { showName: body.showName, site: key, ref: body.ref });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers });
      if (r.first) await milestone(g);
    }
    const me = await myGiveaway(g, user, isAdminEmail, site.url);
    return NextResponse.json({ ok: true, giveaway: g.key, ...me, ...(site === OP_SITE && body?.code !== undefined ? { token } : {}) }, { headers });
  } catch (e) {
    console.warn("[sister-giveaway] failed:", e);
    return NextResponse.json({ error: "Couldn't reach the giveaway. Try again." }, { status: 503, headers });
  }
}
