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
