import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { applyReferral } from "@/lib/referral";
import { onSiteOAuth, providerConfig, isProviderEnabled, isOAuthProvider, redirectUri, sisterRedirectUri, type OAuthProvider } from "@/lib/oauth";
import { claimAlertsForUser } from "@/lib/alerts";
import { SIGNUP_SOURCE_COOKIE, parseSignupSource } from "@/lib/signup-source-shared";
import { sanitizeNextPath, POST_SIGN_IN_FALLBACK } from "@/lib/next-param";
import { PREMIUM_START_PATH } from "@/lib/premium-start";
import { appReturnUrl, appFailUrl, isAppUserAgent, mintAppCode, readAppState } from "@/lib/app-auth";
import { sisterSignupSource } from "@/lib/sister-premium";
import { sisterFailUrl, sisterForCookie, sisterOAuthCookie, sisterOAuthNextCookie, sisterOAuthViaCookie, sisterReturnUrl } from "@/lib/sister-oauth";

// Where a failed sign-in lands. /login by default — it renders AuthForm, which
// turns ?error= into a readable message and offers the buttons again.
//
// The one exception is /premium/start, which renders that SAME form as its
// signed-out state (see that page: sign-in is a step inside checkout now).
// Sending a failure back there keeps the purchase intact — the tier, plan and
// `back` selection survive in the URL — instead of stranding a buyer on a login
// page with no memory of what they were buying. Restricted to that ONE path on
// purpose: any other ?next= destination has no error UI at all, so a failure
// there would render as a silent no-op.
function errorBase(req: Request, provider: string): string {
  const next = sanitizeNextPath(
    cookies().get(`oauth_next_${provider}`)?.value ?? new URL(req.url).searchParams.get("next")
  );
  return next && (next === PREMIUM_START_PATH || next.startsWith(`${PREMIUM_START_PATH}?`)) ? next : "/login";
}

/** A sign-in started on a sister site (lib/sister-oauth.ts), or null. */
function sisterOf(provider: string) {
  return provider ? sisterForCookie(cookies().get(sisterOAuthCookie(provider))?.value) : null;
}

function clearSister(provider: string) {
  cookies().set(sisterOAuthCookie(provider), "", { path: "/", maxAge: 0 });
  cookies().set(sisterOAuthNextCookie(provider), "", { path: "/", maxAge: 0 });
  cookies().set(sisterOAuthViaCookie(provider), "", { path: "/", maxAge: 0 });
}

/** The redirect URI the sign-in started with: the sister's own callback when it ran through the sister's address, else Rift's. */
function webRedirectUri(provider: OAuthProvider): string {
  const sister = sisterOf(provider);
  return sister && onSiteOAuth(provider, sister.key) && cookies().get(sisterOAuthViaCookie(provider))?.value === "1"
    ? sisterRedirectUri(sister.url, provider)
    : redirectUri(provider);
}

function fail(req: Request, code: string, provider = "") {
  const sister = sisterOf(provider);
  if (sister) {
    clearSister(provider);
    return NextResponse.redirect(sisterFailUrl(sister, code));
  }
  const dest = new URL(errorBase(req, provider), req.url);
  dest.searchParams.set("error", code);
  return NextResponse.redirect(dest);
}

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  if (!isOAuthProvider(provider) || !isProviderEnabled(provider)) return fail(req, "provider_unavailable", provider);

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  // A sign-in from inside the Android app carries a signed state instead of a cookie (lib/app-auth.ts): it may land here in
  // Chrome's Custom Tab or, as an App Link, in the app's own WebView.
  const app = await readAppState(state, provider);
  const inApp = isAppUserAgent(req.headers.get("user-agent"));
  const saved = cookies().get(`oauth_state_${provider}`)?.value;
  cookies().set(`oauth_state_${provider}`, "", { path: "/", maxAge: 0 });
  if (!code || !state || (!app && (!saved || state !== saved))) return fail(req, "oauth_state", provider);
  if (app) return finishAppSignIn(req, provider, code, app.challenge, app.next, inApp);

  const who = await identify(provider, code, webRedirectUri(provider));
  if (typeof who === "string") return fail(req, who, provider);
  const { providerId, email, emailVerified, name, avatar } = who;

  // 4) Find-or-create the user (by provider id, then by email), link the identity,
  // and start their session. Wrapped so a DB blip or a misconfigured AUTH_SECRET
  // (see lib/auth.ts's getSecret()) redirects back to a clear "try again" message
  // instead of throwing an unhandled 500 mid-sign-in.
  let user: { id: string; email: string };
  let isNew: boolean;
  try {
    const linked = await upsertOAuthUser(provider, providerId, email, emailVerified, name, avatar);
    if (!linked) return fail(req, "oauth_unverified", provider);
    user = linked.user;
    isNew = linked.isNew;
    // From a sister site: back there with the emailed link's own code, no RiftCompare session (lib/sister-oauth.ts).
    const sister = sisterOf(provider);
    if (sister) {
      const back = await sisterReturnUrl(sister, user.email, cookies().get(sisterOAuthNextCookie(provider))?.value);
      clearSister(provider);
      // A new account made from a sister's Google or Discord button is credited to that sister (lib/sister-premium.ts).
      if (isNew) void prisma.user.update({ where: { id: user.id }, data: { signupSource: sisterSignupSource(sister.key) } }).catch(() => {});
      void claimAlertsForUser(user.id, user.email).catch(() => {});
      void prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
      return NextResponse.redirect(back);
    }
    await createSession(user.id);
  } catch {
    return fail(req, "oauth_session", provider);
  }
  // Adopt any price watches this address created before it had an account —
  // fire-and-forget: a failure here must never block signing in.
  void claimAlertsForUser(user.id, user.email).catch(() => {});
  // "Last seen" for the admin accounts view. Deliberately OUTSIDE the try that
  // wraps createSession above: this is reporting, not auth, and must never be
  // the reason a sign-in fails. Stamped here rather than inside
  // upsertOAuthUser because this is the one point every branch of it
  // (already-linked, linked-by-email, brand-new) converges on.
  void prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
  if (isNew) {
    // First-ever sign-in: credit any referrer. NO PREMIUM IS GRANTED HERE — the
    // automatic signup-time Premium preview was removed on 2026-08-23 (see the
    // note where SIGNUP_PREMIUM_DAYS used to be defined in lib/premium.ts). The
    // ACCOUNT tier — alerts, portfolio, watchlist — is granted by virtue of the
    // account existing and is the durable payoff on its own.
    await applyReferral(user.id).catch(() => {});
    // Which CTA produced this account. The clicked sign-in surface set a
    // short-lived rc_signup_src cookie (see lib/signup-source.ts); the value is
    // whitelisted here before it touches the DB, and the write is best-effort —
    // attribution must never break a sign-in. Cleared either way so a stale
    // cookie can't claim credit for a later, unrelated session.
    const signupSource = parseSignupSource(cookies().get(SIGNUP_SOURCE_COOKIE)?.value);
    if (signupSource) {
      await prisma.user.update({ where: { id: user.id }, data: { signupSource } }).catch(() => {});
    }
  }
  cookies().set(SIGNUP_SOURCE_COOKIE, "", { path: "/", maxAge: 0 });
  // Land where the visitor was headed, not always /profile. The start route
  // stored their sanitized ?next= in a short-lived cookie (mirroring the CSRF
  // state cookie); it's re-sanitized here — defense in depth, since a cookie is
  // client-writable — and cleared either way. Fixes the old flow where someone
  // who signed in to see /watching was dumped on an empty profile instead.
  //
  // A NEW account additionally carries ?welcome=<provider> so the client
  // (SignupWelcome.tsx) can fire the sign_up analytics event — the server knows
  // isNew, the analytics run in the browser, and this param is the bridge
  // across the OAuth redirect. The component strips it from the URL
  // immediately, so it never survives into a refresh, share, or bookmark.
  //
  // NO DESTINATION → /dashboard, not /profile (2026-09-29, owner-approved
  // "where the user lands after login"). The dashboard is the signed-in hub
  // ("Welcome back", portfolio, watchlist, tools, and the setup checklist for
  // a new account); /profile is account settings, which nobody signs in to
  // read. It stays one click away in the account menu. A sign-in that started
  // on a page still returns to that page.
  const next = sanitizeNextPath(cookies().get(`oauth_next_${provider}`)?.value);
  cookies().set(`oauth_next_${provider}`, "", { path: "/", maxAge: 0 });
  const dest = new URL(next ?? POST_SIGN_IN_FALLBACK, req.url);
  if (isNew) dest.searchParams.set("welcome", provider);
  return NextResponse.redirect(dest);
}

interface Identity {
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string | undefined;
  avatar: string | null;
}

// Steps 1-3 of a sign-in, shared by the web and the app flows: the provider's code → its profile → our fields. A string is the
// error code to show.
async function identify(provider: OAuthProvider, code: string, redirect = redirectUri(provider)): Promise<Identity | string> {
  const cfg = providerConfig(provider);

  // 1) Exchange the code for an access token.
  let tok: { access_token?: string };
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: cfg.clientId!,
        client_secret: cfg.clientSecret!,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
      }),
    });
    if (!res.ok) return "oauth_token";
    tok = await res.json();
  } catch {
    return "oauth_token";
  }
  if (!tok.access_token) return "oauth_token";

  // 2) Fetch the profile.
  let profile: Record<string, unknown>;
  try {
    const res = await fetch(cfg.userUrl, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!res.ok) return "oauth_profile";
    profile = await res.json();
  } catch {
    return "oauth_profile";
  }

  // 3) Normalise the fields per provider.
  //
  // emailVerified is NOT decoration — it is the entire basis on which an EMAIL
  // MATCH is allowed to hand this sign-in someone's account. Both providers let
  // an account CLAIM an address it has not proven: Discord returns
  // `verified:false` on /users/@me until the new address is confirmed, and Google
  // returns `email_verified:false` for accounts whose address it hasn't
  // validated. So the address alone says nothing about who owns the inbox —
  // anyone can point a throwaway account at someone else's address and authorise
  // from it. It is passed down to upsertOAuthUser, which gates the two branches
  // that actually consume the address; see the note there for why the gate does
  // NOT live up here.
  let providerId: string | undefined;
  let email: string | undefined;
  let emailVerified = false;
  let name: string | undefined;
  let avatar: string | null = null;
  if (provider === "google") {
    providerId = profile.sub as string;
    email = (profile.email as string)?.toLowerCase();
    emailVerified = profile.email_verified === true || profile.email_verified === "true";
    name = profile.name as string;
    avatar = (profile.picture as string) ?? null;
  } else {
    providerId = profile.id as string;
    email = (profile.email as string)?.toLowerCase();
    emailVerified = profile.verified === true;
    name = (profile.global_name as string) || (profile.username as string);
    avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null;
  }
  if (!providerId || !email) return "oauth_noemail";
  return { providerId, email, emailVerified, name, avatar };

}

// The end of a sign-in started inside the Android app (lib/app-auth.ts): the same find-or-create as the web, then a one-time code
// for the app instead of a session here, since "here" may be Chrome's jar rather than the app's.
async function finishAppSignIn(
  req: Request,
  provider: OAuthProvider,
  code: string,
  challenge: string,
  next: string | null,
  inApp: boolean
): Promise<NextResponse> {
  const failApp = (c: string) => NextResponse.redirect(appFailUrl(c, inApp, req.url));
  const who = await identify(provider, code);
  if (typeof who === "string") return failApp(who);
  let appCode: string;
  try {
    const linked = await upsertOAuthUser(provider, who.providerId, who.email, who.emailVerified, who.name, who.avatar);
    if (!linked) return failApp("oauth_unverified");
    if (linked.isNew) await applyReferral(linked.user.id).catch(() => {});
    void claimAlertsForUser(linked.user.id, linked.user.email).catch(() => {});
    appCode = await mintAppCode(linked.user.id, challenge);
  } catch {
    return failApp("oauth_session");
  }
  return NextResponse.redirect(appReturnUrl(appCode, next, inApp, req.url));
}

// Returns null when the sign-in must be refused. `emailVerified` says whether the
// PROVIDER vouches for the address; it gates only the two branches that use the
// address to decide which account this is.
//
// It deliberately does NOT gate the whole function. Matching on googleId/discordId
// is proof of identity that does not involve the email at all — that branch never
// reads the parameter — so refusing it would lock a member out of an account they
// linked long ago because their provider-side address happens to be mid-
// reverification. On an OAuth-only site (password auth and /forgot are gone, see
// tests/auth-oauth-only.test.ts) that is a real availability cost for zero
// security gain: the attack this guards against is impersonating an address, and
// an attacker holding the linked provider id already owns the account.
async function upsertOAuthUser(
  provider: OAuthProvider,
  providerId: string,
  email: string,
  emailVerified: boolean,
  name: string | undefined,
  avatar: string | null
) {
  const byProvider =
    provider === "google"
      ? await prisma.user.findFirst({ where: { googleId: providerId } })
      : await prisma.user.findFirst({ where: { discordId: providerId } });
  const link = provider === "google" ? { googleId: providerId } : { discordId: providerId };

  // Already linked to this provider id → just refresh avatar / verification.
  // Note this never writes `email`, so a member who repoints their provider
  // account at someone else's address cannot move their RiftCompare address onto
  // it — including onto one isAdminEmail() honours.
  if (byProvider) {
    const user = await prisma.user.update({
      where: { id: byProvider.id },
      data: {
        // Only an address the provider vouches for may stamp an account verified:
        // stamping emailVerified from an unproven address would let an account
        // claim an identity it hasn't demonstrated. An account that is already
        // verified stays verified.
        emailVerified: byProvider.emailVerified ?? (emailVerified ? new Date() : null),
        avatarUrl: byProvider.avatarUrl ?? avatar,
      },
    });
    return { user, isNew: false };
  }

  // FROM HERE DOWN THE EMAIL DECIDES WHICH ACCOUNT THIS IS, so it has to be one
  // the provider has actually verified.
  //
  // Refused rather than downgraded to "create a separate account", because
  // isAdminEmail() in lib/auth.ts grants moderator powers BY ADDRESS: a brand-new
  // account carrying one of those addresses would be an admin. An unproven
  // address must not enter the system at all.
  if (!emailVerified) return null;

  // Link to an existing account with the same email — sound only because of the
  // check immediately above. The provider vouching for the address is what makes
  // "same email" mean "same person"; without it this branch is an account
  // takeover. Security: if that account was
  // NEVER email-verified yet has a password, the password was set without proving
  // inbox ownership (a possible squatter) — discard it, since the OAuth provider is
  // now the authority on this email. The real owner can set a fresh one via /forgot.
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    const user = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        ...link,
        emailVerified: byEmail.emailVerified ?? new Date(),
        avatarUrl: byEmail.avatarUrl ?? avatar,
        ...(!byEmail.emailVerified && byEmail.passwordHash ? { passwordHash: null } : {}),
      },
    });
    return { user, isNew: false };
  }
  const user = await prisma.user.create({
    data: {
      email,
      displayName: (name ?? email.split("@")[0]).slice(0, 24),
      ...link,
      emailVerified: new Date(),
      avatarUrl: avatar,
    },
  });
  return { user, isNew: true };
}
