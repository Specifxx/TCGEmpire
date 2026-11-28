// OAuth sign-in (Google + Discord) layered on top of the existing JWT-cookie
// session — the callback just find-or-creates a user and calls createSession(), so
// nothing else in the auth system changes. Switch a provider on by setting its
// client id + secret in env:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
// Redirect URI to register with each provider:
//   https://riftcompare.com/api/auth/oauth/google/callback
//   https://riftcompare.com/api/auth/oauth/discord/callback
import { SITE_URL } from "./site";

export type OAuthProvider = "google" | "discord";
export const OAUTH_PROVIDERS: OAuthProvider[] = ["google", "discord"];

export interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
}

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === "google" || v === "discord";
}

export function providerConfig(provider: OAuthProvider): ProviderConfig {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
      scope: "openid email profile",
    };
  }
  return {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    authUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
  };
}

export function isProviderEnabled(provider: OAuthProvider): boolean {
  const c = providerConfig(provider);
  return !!(c.clientId && c.clientSecret);
}

export function enabledProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter(isProviderEnabled);
}

export function redirectUri(provider: OAuthProvider): string {
  return `${SITE_URL}/api/auth/oauth/${provider}/callback`;
}

/**
 * A sister sign-in that came through the sister's own /account-service/oauth rewrite (`?via=site`) uses the sister's own callback, so
 * the visitor never sees riftcompare.com, for every site whose callback is registered with that provider (owner, 2026-11-21):
 * - Discord: all 11 sister callbacks are in the Discord app.
 * - Google: 9 are in Rift's Google client. Google allows 10 unverified authorized domains per project, so DexCompare (its own Google
 *   client, never this flow) and SportsCardCompare stay on Rift's callback until the domains are verified in Search Console.
 * - Compare Empire (2026-11-28) is on neither app yet: its buttons go straight to riftcompare.com (never through its rewrite, whose
 *   cookies would land on the wrong host) until the owner registers compareempire.com/account-service/oauth/<provider>/callback.
 */
const OFF_SITE_OAUTH: Record<OAuthProvider, readonly string[]> = { discord: ["ce"], google: ["dex", "wax", "ce"] };

export function onSiteOAuth(provider: OAuthProvider, siteKey: string): boolean {
  return !OFF_SITE_OAUTH[provider].includes(siteKey);
}

export function sisterRedirectUri(siteUrl: string, provider: OAuthProvider): string {
  return `${siteUrl}/account-service/oauth/${provider}/callback`;
}
