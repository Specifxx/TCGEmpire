import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { awardPoints } from "@/lib/points";
import { applyReferral } from "@/lib/referral";
import { grantEarlyAdopterPremium } from "@/lib/premium";
import { providerConfig, isProviderEnabled, isOAuthProvider, redirectUri, type OAuthProvider } from "@/lib/oauth";

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
  let providerId: string | undefined;
  let email: string | undefined;
  let name: string | undefined;
  let avatar: string | null = null;
  if (provider === "google") {
    providerId = profile.sub as string;
    email = (profile.email as string)?.toLowerCase();
    name = profile.name as string;
    avatar = (profile.picture as string) ?? null;
  } else {
    providerId = profile.id as string;
    email = (profile.email as string)?.toLowerCase();
    name = (profile.global_name as string) || (profile.username as string);
    avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null;
  }
  if (!providerId || !email) return fail(req, "oauth_noemail");

  // 4) Find-or-create the user (by provider id, then by email) and link the identity.
  const { user, isNew } = await upsertOAuthUser(provider, providerId, email, name, avatar);
  await createSession(user.id);
  if (isNew) {
    // First-ever sign-in: seed the loyalty economy and credit any referrer.
    await awardPoints(user.id, "welcome").catch(() => {});
    await applyReferral(user.id);
    // Early-adopter promo: the first 100 accounts get free Premium (best-effort).
    await grantEarlyAdopterPremium(user.id).catch(() => {});
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

  // Otherwise link to an existing account with the same email (the provider has
  // verified this email, so it's the same person). Security: if that account was
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
