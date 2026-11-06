import { NextResponse } from "next/server";
import { normalizeSignInEmail, signInTokenFor, signInLinkUrl, SIGN_IN_LINK_MINUTES } from "@/lib/email-sign-in";
import { sendSignInLinkEmail } from "@/lib/email";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Send a one-time sign-in link to an address (2026-11-06, lib/email-sign-in.ts).
// Always answers the same generic ok, whether or not an account exists, so the
// form cannot be used to learn who has one. Rate-limited per IP and per address
// so it cannot be used to flood someone's inbox.
export async function POST(req: Request) {
  const ipLimit = rateLimit(`email-link:ip:${clientIp(req)}`, 8, 60 * 60_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);
  const body = await req.json().catch(() => null);
  const email = normalizeSignInEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const next = typeof body?.next === "string" ? body.next : null;

  const emailLimit = rateLimit(`email-link:email:${email}`, 4, 60 * 60_000);
  if (emailLimit.ok) {
    try {
      const t = await signInTokenFor(email);
      if (t) {
        const sent = await sendSignInLinkEmail(email, signInLinkUrl(t.token, next), { minutes: SIGN_IN_LINK_MINUTES });
        if (!sent) console.error(`[email-link] sign-in email to ${email} was not sent`);
      }
    } catch (e) {
      console.error("[email-link] could not send a sign-in link:", e);
      return NextResponse.json({ error: "Couldn't send the email. Please try again in a minute." }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
