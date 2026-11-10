import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/email";
import { button, fromFor, shell } from "@/lib/sister-alerts/email";
import { sisterSite } from "@/lib/sister-alerts/sites";
import { sendSisterMail } from "@/lib/sister-alerts/send";
import {
  EMAIL_LINK_MINUTES,
  EMAIL_SHAPE,
  emailLinkUrl,
  googleClientIdFor,
  maskEmail,
  memberFor,
  premiumCors,
  premiumSiteForOrigin,
  premiumStatusFor,
  signEmailLinkCode,
  signPremiumSession,
  verifyEmailLinkCode,
  verifyGoogleCredential,
  type PremiumSite,
} from "@/lib/sister-premium";

export const dynamic = "force-dynamic";

// Sign in ON the sister site (lib/sister-premium.ts, "Signing in ON the sister site"). Three calls, all from the sister's own browser
// origin (exact-origin CORS), rate limited:
//   { method: "google", credential }  → Google's ID token for the site's client → a premium-session token
//   { method: "email", email }        → mails a 20-minute sign-in link from the site's own sender → { sent: true }
//   { method: "link", code }          → the code from that link → a premium-session token
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

async function session(site: PremiumSite, email: string, headers: Record<string, string>) {
  // Remember that this account uses the site (admin Accounts › DexCompare tab). Best effort.
  await prisma.sisterMember
    .upsert({ where: { email_site: { email, site: site.key } }, create: { email, site: site.key }, update: { lastLinkedAt: new Date() } })
    .catch((e: unknown) => console.warn("[sister-premium] member record failed:", e));
  const token = await signPremiumSession(site, email);
  const s = await premiumStatusFor(email);
  return NextResponse.json({ ok: true, token, premium: !!s?.premium, until: s?.until ?? null, who: maskEmail(email) }, { headers });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const ip = clientIp(req);
  if (!rateLimit(`sister-premium-sign-in:${ip}`, 12, 10 * 60_000).ok) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429, headers });
  }
  const body = (await req.json().catch(() => null)) as { method?: unknown; credential?: unknown; email?: unknown; code?: unknown } | null;

  try {
    if (body?.method === "google") {
      const clientId = googleClientIdFor(site);
      if (!clientId) return NextResponse.json({ error: "Google sign-in isn't set up yet. Use the email link." }, { status: 503, headers });
      const g = await verifyGoogleCredential(body.credential, clientId);
      if (!g) return NextResponse.json({ error: "Google didn't confirm that sign-in. Try again." }, { status: 401, headers });
      const m = await memberFor(g.email, g);
      return await session(site, m.email, headers);
    }

    if (body?.method === "email") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!EMAIL_SHAPE.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers });
      if (!rateLimit(`sister-premium-link:${email}`, 3, 60 * 60_000).ok) {
        return NextResponse.json({ error: "We've just sent you a link. Check your inbox (and spam)." }, { status: 429, headers });
      }
      const mailSite = sisterSite(site.key);
      if (!mailSite) return NextResponse.json({ error: "Email sign-in isn't available here." }, { status: 503, headers });
      const url = emailLinkUrl(site, await signEmailLinkCode(site, email));
      const subject = `Your ${site.name} sign-in link`;
      const inner = `
    <tr><td style="padding:8px 28px 6px;font-size:14px;line-height:1.6;color:#374151">Tap the button to sign in to ${escapeHtml(site.name)}. The link works for ${EMAIL_LINK_MINUTES} minutes.</td></tr>
    <tr><td style="padding:10px 28px 18px">${button(mailSite, url, `Sign in to ${site.name}`)}</td></tr>
    <tr><td style="padding:0 28px 22px;font-size:13px;line-height:1.6;color:#6b7280">If you didn't ask to sign in, ignore this email: nothing happens without the link.</td></tr>`;
      const html = shell(mailSite, `Sign in to ${escapeHtml(site.name)}`, inner, "", "Your sign-in link");
      const text = `${subject}\n\nOpen this link to sign in (it works for ${EMAIL_LINK_MINUTES} minutes):\n${url}\n\nIf you didn't ask to sign in, ignore this email.`;
      const ok = await sendSisterMail(site.key, email, subject, html, { text, from: fromFor(mailSite) });
      if (!ok) return NextResponse.json({ error: "We couldn't send the email. Try again in a minute." }, { status: 502, headers });
      return NextResponse.json({ ok: true, sent: true }, { headers });
    }

    if (body?.method === "link") {
      const email = await verifyEmailLinkCode(body.code, site);
      if (!email) return NextResponse.json({ error: "That link has expired. Ask for a new one." }, { status: 401, headers });
      const m = await memberFor(email);
      return await session(site, m.email, headers);
    }
  } catch (e) {
    console.warn("[sister-premium] sign-in failed:", e);
    return NextResponse.json({ error: "Sign-in failed. Try again." }, { status: 503, headers });
  }
  return NextResponse.json({ error: "Unknown sign-in method." }, { status: 400, headers });
}
