import { NextResponse } from "next/server";
import { findActiveAffiliate } from "@/lib/creator-affiliate";
import { AFFILIATE_COOKIE, AFFILIATE_COOKIE_MAX_AGE } from "@/lib/creator-affiliate-code";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// A creator's share link, riftcompare.com/r/CODE (2026-10-16). Remembers an
// active code for 30 days (the rc_aff cookie, which checkout reads) and opens
// /premium. An unknown or switched-off code still lands on /premium, just
// without a discount. One indexed read per click; never cached (per visitor).
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const a = await findActiveAffiliate(params.code).catch(() => null);
  const res = NextResponse.redirect(`${SITE_URL}/premium${a ? `?code=${a.code}` : ""}`, 307);
  res.headers.set("Cache-Control", "private, no-store");
  if (a) {
    res.cookies.set(AFFILIATE_COOKIE, a.code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AFFILIATE_COOKIE_MAX_AGE,
    });
  }
  return res;
}
