import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { consumeSignInToken, setNameIfPlaceholder } from "@/lib/email-sign-in";
import { sanitizeNextPath, POST_SIGN_IN_FALLBACK } from "@/lib/next-param";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Open an emailed sign-in link: POST only (the /login/email button), never a
// GET, so a mail scanner fetching the link cannot use it up. lib/email-sign-in.ts.
export async function POST(req: Request) {
  const limit = rateLimit(`email-link:consume:${clientIp(req)}`, 20, 60 * 60_000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const result = await consumeSignInToken(token).catch((e) => {
    console.error("[email-link] consume failed:", e);
    return null;
  });
  if (!result) {
    return NextResponse.json(
      { error: "This sign-in link has expired or was already used. Ask for a new one below." },
      { status: 400 }
    );
  }
  await setNameIfPlaceholder(result.userId, body?.name).catch(() => {});
  await createSession(result.userId);
  const next = sanitizeNextPath(typeof body?.next === "string" ? body.next : null) ?? POST_SIGN_IN_FALLBACK;
  const dest = result.isNew ? `${next}${next.includes("?") ? "&" : "?"}welcome=email` : next;
  return NextResponse.json({ ok: true, next: dest });
}
