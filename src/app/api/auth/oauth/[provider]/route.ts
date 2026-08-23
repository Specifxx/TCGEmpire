import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { providerConfig, isProviderEnabled, isOAuthProvider, redirectUri } from "@/lib/oauth";
import { sanitizeNextPath } from "@/lib/next-param";

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
  // Where to land after sign-in. Carried in its OWN short-lived cookie, exactly
  // like the CSRF state above, rather than stuffed into the state param — the
  // state stays an opaque token, and there are no provider URL-length/encoding
  // edge cases to reason about. Sanitized here AND again in the callback
  // (defense in depth); the callback clears it either way.
  const next = sanitizeNextPath(new URL(req.url).searchParams.get("next"));
  if (next) {
    cookies().set(`oauth_next_${provider}`, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  }

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
