import { NextResponse } from "next/server";
import { sendEmail, escapeHtml } from "@/lib/email";
import { normalizeSignInEmail } from "@/lib/email-sign-in";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { SISTER_SIGN_IN_MINUTES, signInSiteForOrigin, signSisterSignIn, sisterSignInUrl } from "@/lib/sister-sign-in";

export const dynamic = "force-dynamic";

// A sister site's "Email me a sign-in link" (lib/sister-sign-in.ts). Called
// cross-origin from that site's exact origin only. Always the same ok, so it
// never says whether the sister has an account for the address; rate-limited
// per network and per address so it cannot flood an inbox.
function cors(origin: string | null): Record<string, string> {
  if (!signInSiteForOrigin(origin) || !origin) return { Vary: "Origin" };
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
  return new NextResponse(null, { status: signInSiteForOrigin(origin) ? 204 : 403, headers: cors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Cache-Control": "no-store" };
  const site = signInSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const ip = rateLimit(`sister-sign-in:ip:${clientIp(req)}`, 8, 60 * 60_000);
  if (!ip.ok) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers });
  const body = await req.json().catch(() => null);
  const email = normalizeSignInEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers });

  if (rateLimit(`sister-sign-in:email:${site.key}:${email}`, 4, 60 * 60_000).ok) {
    try {
      const url = sisterSignInUrl(site, await signSisterSignIn(site, email), body?.next);
      const raw = process.env.EMAIL_FROM ?? "noreply@riftcompare.com";
      const addr = /<([^>]+)>/.exec(raw)?.[1] ?? raw.trim();
      const line = `Tap the button to sign in to ${site.name}. The link works once and lasts ${SISTER_SIGN_IN_MINUTES} minutes. No password needed.`;
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 8px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px">
<tr><td style="padding:26px 28px 4px;font-size:20px;font-weight:800;color:#111827">${escapeHtml(site.name)}</td></tr>
<tr><td style="padding:8px 28px 14px;font-size:14px;line-height:1.6;color:#374151">${escapeHtml(line)}</td></tr>
<tr><td style="padding:4px 28px 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#111827;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Sign in to ${escapeHtml(site.name)}</a></td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">If you didn't ask for this, you can ignore this email.<br/>Sent for ${escapeHtml(site.name)} by its sister site RiftCompare (riftcompare.com).</td></tr>
</table></td></tr></table></body></html>`;
      const ok = await sendEmail(email, `Your ${site.name} sign-in link`, html, {
        text: `${line}\n\nSign in: ${url}\n\nIf you didn't ask for this, you can ignore this email.\n`,
        from: `${site.name} <${addr}>`,
      });
      if (!ok) console.error(`[sister-sign-in] ${site.key} sign-in email was not sent`);
    } catch (e) {
      console.error("[sister-sign-in] could not send:", e);
      return NextResponse.json({ error: "Couldn't send the email. Please try again in a minute." }, { status: 500, headers });
    }
  }
  return NextResponse.json({ ok: true }, { headers });
}
