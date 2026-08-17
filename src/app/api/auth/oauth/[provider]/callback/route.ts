import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { applyReferral } from "@/lib/referral";
import { providerConfig, isProviderEnabled, isOAuthProvider, redirectUri, type OAuthProvider } from "@/lib/oauth";
import { claimAlertsForUser } from "@/lib/alerts";

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
  // emailVerified is NOT decoration — it is the entire basis on which step 4 is
  // allowed to hand this sign-in an existing account. Both providers let an
  // account CLAIM an address it has not proven: Discord returns `verified:false`
  // on /users/@me until the new address is confirmed, and Google returns
  // `email_verified:false` for accounts whose address it hasn't validated. So the
  // address alone says nothing about who owns the inbox — anyone can point a
  // throwaway account at someone else's address and authorise from it.
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
  // Strict, not "unverified means create a fresh account": this site grants
  // moderator powers by email address (isAdminEmail in lib/auth.ts), and a new
  // account carrying an admin address would be an admin. An unproven address must
  // not enter the system at all.
  if (!emailVerified) return fail(req, "oauth_unverified");

  // 4) Find-or-create the user (by provider id, then by email) and link the identity.
  const { user, isNew } = await upsertOAuthUser(provider, providerId, email, name, avatar);
  await createSession(user.id);
  // Adopt any price watches this address created before it had an account —
  // fire-and-forget: a failure here must never block signing in.
  void claimAlertsForUser(user.id, user.email).catch(() => {});
  if (isNew) {
    // First-ever sign-in: credit any referrer. New accounts get the ACCOUNT tier
    // (Bulk Pricer + Best Basket + alerts + portfolio + marketplace) immediately
    // by virtue of existing — there is no signup-time Premium comp to apply.
    await applyReferral(user.id);
  }
  // Land new/returning sign-ins on their profile by default.
  return NextResponse.redirect(new URL("/profile", req.url));
}

async function upsertOAuthUser(
  provider: OAuthProvider,
  providerId: string,
  email: string,
  name: string | undefined,
  avatar: string | null
) {
  const byProvider =
    provider === "google"
      ? await prisma.user.findFirst({ where: { googleId: providerId } })
      : await prisma.user.findFirst({ where: { discordId: providerId } });
  const link = provider === "google" ? { googleId: providerId } : { discordId: providerId };

  // Already linked to this provider id → just refresh avatar / verification.
  if (byProvider) {
    const user = await prisma.user.update({
      where: { id: byProvider.id },
      data: { emailVerified: byProvider.emailVerified ?? new Date(), avatarUrl: byProvider.avatarUrl ?? avatar },
    });
    return { user, isNew: false };
  }

  // Otherwise link to an existing account with the same email. This is only sound
  // because the caller has already rejected unverified provider emails — the
  // provider vouching for the address is what makes "same email" mean "same
  // person" here, and without that check this branch is an account takeover.
  // Security: if that account was
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
