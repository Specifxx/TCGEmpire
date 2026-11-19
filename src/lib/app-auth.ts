import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { authSecret } from "./auth-secret";
import { sanitizeNextPath } from "./next-param";

// Signing in from INSIDE the Android app (2026-11-19, DECISIONS.md "Sign-in inside the Android app").
//
// Google refuses OAuth in an embedded WebView (403 disallowed_useragent), and the app is a WebView of this site. So the app
// opens the provider in a Chrome Custom Tab, whose cookie jar is NOT the WebView's: a session made there would sign the visitor
// in to Chrome, not the app. The round trip therefore ends with a one-time code the app trades for a session in its own jar:
//
//   WebView: verifier = random, kept in localStorage; challenge = base64url(sha256(verifier))
//   WebView → fetch /api/auth/oauth/<p>?app=<challenge>&json=1 → { url }        (the provider's own URL, state = signed JWT below)
//   Custom Tab → provider → /api/auth/oauth/<p>/callback?state=<jwt>             (no state cookie needed: Chrome may hand this URL
//                                                                                 to the app as an App Link, so it can land in either jar)
//   callback → AuthToken purpose "app", token = "<challenge>.<code>", 5 minutes
//     in Chrome:    302 com.riftcompare.app://auth?code=<code>&n=<next>   → the app → WebView /login/app?code=…
//     in the app:   302 /login/app?code=<code>&n=<next>
//   /login/app (WebView) → POST /api/auth/app-exchange { code, verifier } → session cookie in the WebView, like any sign-in
//
// The code is useless without the verifier, which never leaves the WebView: a code that leaks (or a crafted link that feeds a
// victim someone else's code) cannot be redeemed. The state JWT carries the challenge, so a callback URL replayed into another
// device mints a code bound to the attacker's challenge, which that device cannot redeem either.

export const APP_SCHEME = "com.riftcompare.app";
export const APP_UA_TOKEN = "RiftCompareApp";
const STATE_PURPOSE = "app-oauth";
const CODE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/; // base64url of a 32-byte SHA-256, no padding
const CODE = /^[a-f0-9]{48}$/;

/** True for the app's WebView (capacitor.config.ts appends this token to its User-Agent). */
export function isAppUserAgent(ua: string | null | undefined): boolean {
  return !!ua && ua.includes(APP_UA_TOKEN);
}

export function isAppChallenge(v: string | null | undefined): v is string {
  return !!v && CHALLENGE.test(v);
}

export function challengeOf(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface AppOAuthState {
  provider: string;
  challenge: string;
  next: string | null;
}

/** The OAuth `state` for an app sign-in: signed, ten minutes, bound to the provider and the app's challenge. */
export async function signAppState(s: AppOAuthState): Promise<string> {
  return new SignJWT({ p: s.provider, c: s.challenge, n: s.next ?? "", u: STATE_PURPOSE, r: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(authSecret());
}

/** The app state back, or null when it is not one (a plain web sign-in's hex state), forged, expired or for another provider. */
export async function readAppState(state: string | null | undefined, provider: string): Promise<AppOAuthState | null> {
  if (!state || state.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(state, authSecret(), { algorithms: ["HS256"] });
    if (payload.u !== STATE_PURPOSE || payload.p !== provider || !isAppChallenge(payload.c as string)) return null;
    return { provider, challenge: payload.c as string, next: sanitizeNextPath((payload.n as string) || null) };
  } catch {
    return null;
  }
}

/** A one-time code for this user, redeemable only with the verifier behind `challenge`. */
export async function mintAppCode(userId: string, challenge: string): Promise<string> {
  const code = randomBytes(24).toString("hex");
  await prisma.authToken.create({
    data: { token: `${challenge}.${code}`, purpose: "app", userId, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return code;
}

/** The user id for a code and its verifier (single use), or null. */
export async function redeemAppCode(code: unknown, verifier: unknown): Promise<string | null> {
  if (typeof code !== "string" || !CODE.test(code)) return null;
  if (typeof verifier !== "string" || verifier.length < 43 || verifier.length > 128) return null;
  const token = `${challengeOf(verifier)}.${code}`;
  const row = await prisma.authToken.findUnique({ where: { token } });
  if (!row || row.purpose !== "app") return null;
  // Belt and braces: the lookup already matched the whole string.
  if (!timingSafeEqual(Buffer.from(row.token), Buffer.from(token))) return null;
  await prisma.authToken.delete({ where: { id: row.id } }).catch(() => {});
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}

/** Where the callback sends a finished app sign-in: the app's own scheme from Chrome, the exchange page inside the app. */
export function appReturnUrl(code: string, next: string | null, inApp: boolean, origin: string): string {
  const q = new URLSearchParams({ code });
  if (next) q.set("n", next);
  return inApp ? new URL(`/login/app?${q}`, origin).toString() : `${APP_SCHEME}://auth?${q}`;
}

/** Where a failed app sign-in goes: back to the app with the error, which /login shows like any other. */
export function appFailUrl(error: string, inApp: boolean, origin: string): string {
  const q = new URLSearchParams({ error });
  return inApp ? new URL(`/login?${q}`, origin).toString() : `${APP_SCHEME}://auth?${q}`;
}

/** What a purchase attempted inside the Android app is told (Play payments policy; owner, 2026-11-19). Names no other way to pay. */
export const APP_NO_PURCHASE = "Premium can't be bought in the app.";
