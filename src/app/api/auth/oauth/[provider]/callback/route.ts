import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { applyReferral } from "@/lib/referral";
import { providerConfig, isProviderEnabled, isOAuthProvider, redirectUri, type OAuthProvider } from "@/lib/oauth";
import { claimAlertsForUser } from "@/lib/alerts";
import { SIGNUP_SOURCE_COOKIE, parseSignupSource } from "@/lib/signup-source-shared";
import { sanitizeNextPath } from "@/lib/next-param";

function fail(req: Request, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
}

export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  if (!isOAuthProvider(provider) || !isProviderEnabled(provider)) return fail(req, "provider_unavailable");

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const saved = cookies().get(`oauth_state_${provider}`)?.value;
  cookies().set(`oauth_state_${provider}`, "", { path: "/", maxAge: 0 });
  if (!code || !state || !saved || state !== saved) return fail(req, "oauth_state");

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
        redirect_uri: redirectUri(provider),
      }),
    });
    if (!res.ok) return fail(req, "oauth_token");
    tok = await res.json();
  } catch {
    return fail(req, "oauth_token");
  }
  if (!tok.access_token) return fail(req, "oauth_token");

  // 2) Fetch the profile.
  let profile: Record<string, unknown>;
  try {
    const res = await fetch(cfg.userUrl, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (!res.ok) return fail(req, "oauth_profile");
    profile = await res.json();
  } catch {
    return fail(req, "oauth_profile");
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
  if (!providerId || !email) return fail(req, "oauth_noemail");

  // 4) Find-or-create the user (by provider id, then by email), link the identity,
  // and start their session. Wrapped so a DB blip or a misconfigured AUTH_SECRET
  // (see lib/auth.ts's getSecret()) redirects back to a clear "try again" message
  // instead of throwing an unhandled 500 mid-sign-in.
  let user: { id: string; email: string };
  let isNew: boolean;
  try {
    const linked = await upsertOAuthUser(provider, providerId, email, emailVerified, name, avatar);
    if (!linked) return fail(req, "oauth_unverified");
    user = linked.user;
    isNew = linked.isNew;
    await createSession(user.id);
  } catch {
    return fail(req, "oauth_session");
  }
  // Adopt any price watches this address created before it had an account —
  // fire-and-forget: a failure here must never block signing in.
  void claimAlertsForUser(user.id, user.email).catch(() => {});
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
  const next = sanitizeNextPath(cookies().get(`oauth_next_${provider}`)?.value);
  cookies().set(`oauth_next_${provider}`, "", { path: "/", maxAge: 0 });
  const dest = new URL(next ?? "/profile", req.url);
  if (isNew) dest.searchParams.set("welcome", provider);
  return NextResponse.redirect(dest);
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
