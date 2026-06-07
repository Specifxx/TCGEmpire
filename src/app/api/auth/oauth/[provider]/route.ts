import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { providerConfig, isProviderEnabled, isOAuthProvider, redirectUri } from "@/lib/oauth";

// Kick off the OAuth flow: set a CSRF state cookie and redirect to the provider.
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  if (!isOAuthProvider(provider) || !isProviderEnabled(provider)) {
    return NextResponse.redirect(new URL("/login?error=provider_unavailable", req.url));
  }
  const cfg = providerConfig(provider);
  const state = randomBytes(16).toString("hex");
  cookies().set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId!);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return NextResponse.redirect(url.toString());
}
