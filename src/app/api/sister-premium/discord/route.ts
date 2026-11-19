import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { isProviderEnabled, providerConfig, redirectUri } from "@/lib/oauth";
import { premiumSite } from "@/lib/sister-premium";
import { sanitizeNextPath } from "@/lib/next-param";
import { SISTER_OAUTH_COOKIE, SISTER_OAUTH_NEXT_COOKIE, sisterFailUrl } from "@/lib/sister-oauth";

export const dynamic = "force-dynamic";

// "Continue with Discord" from a sister site (lib/sister-oauth.ts). Only a site in SISTER_PREMIUM_SITES; the return address is that
// site's own canonical URL, never one taken from the request.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const site = premiumSite(q.get("site"));
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 400 });
  if (!isProviderEnabled("discord")) return NextResponse.redirect(sisterFailUrl(site, "provider_unavailable"));
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  const state = randomBytes(16).toString("hex");
  cookies().set("oauth_state_discord", state, opts);
  cookies().set(SISTER_OAUTH_COOKIE, site.key, opts);
  const next = sanitizeNextPath(q.get("next"));
  if (next) cookies().set(SISTER_OAUTH_NEXT_COOKIE, next, opts);
  else cookies().set(SISTER_OAUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  // A Rift-side ?next= from an earlier, abandoned Rift sign-in must not hijack this one.
  cookies().set("oauth_next_discord", "", { path: "/", maxAge: 0 });
  const cfg = providerConfig("discord");
  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId!);
  url.searchParams.set("redirect_uri", redirectUri("discord"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
