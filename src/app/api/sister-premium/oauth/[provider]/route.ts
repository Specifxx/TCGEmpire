import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { ON_SITE_OAUTH, isOAuthProvider, isProviderEnabled, providerConfig, redirectUri, sisterRedirectUri } from "@/lib/oauth";
import { premiumSite } from "@/lib/sister-premium";
import { sanitizeNextPath } from "@/lib/next-param";
import { sisterFailUrl, sisterOAuthCookie, sisterOAuthNextCookie, sisterOAuthViaCookie } from "@/lib/sister-oauth";

export const dynamic = "force-dynamic";

// "Continue with Discord" / "Continue with Google" from a sister site (lib/sister-oauth.ts). Only a site in SISTER_PREMIUM_SITES; the return address is that
// site's own canonical URL, never one taken from the request.
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = params.provider;
  const q = new URL(req.url).searchParams;
  const site = premiumSite(q.get("site"));
  if (!site || !isOAuthProvider(provider)) return NextResponse.json({ error: "Unknown site" }, { status: 400 });
  if (!isProviderEnabled(provider)) return NextResponse.redirect(sisterFailUrl(site, "provider_unavailable"));
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  const state = randomBytes(16).toString("hex");
  cookies().set(`oauth_state_${provider}`, state, opts);
  cookies().set(sisterOAuthCookie(provider), site.key, opts);
  const next = sanitizeNextPath(q.get("next"));
  if (next) cookies().set(sisterOAuthNextCookie(provider), next, opts);
  else cookies().set(sisterOAuthNextCookie(provider), "", { path: "/", maxAge: 0 });
  // Through the sister's own /account-service/oauth rewrite: these cookies live on the sister's host, so the provider must
  // come back there too (its registered callback). Only for a provider whose app lists every sister's callback.
  const onSite = q.get("via") === "site" && ON_SITE_OAUTH.includes(provider);
  if (onSite) cookies().set(sisterOAuthViaCookie(provider), "1", opts);
  else cookies().set(sisterOAuthViaCookie(provider), "", { path: "/", maxAge: 0 });
  // A Rift-side ?next= from an earlier, abandoned Rift sign-in must not hijack this one.
  cookies().set(`oauth_next_${provider}`, "", { path: "/", maxAge: 0 });
  const cfg = providerConfig(provider);
  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId!);
  url.searchParams.set("redirect_uri", onSite ? sisterRedirectUri(site.url, provider) : redirectUri(provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  return NextResponse.redirect(url.toString());
}
