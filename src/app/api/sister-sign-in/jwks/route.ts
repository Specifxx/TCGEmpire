import { NextResponse } from "next/server";
import { sisterSignInJwks } from "@/lib/sister-sign-in";

// The PUBLIC key a sister checks our sign-in tokens with (lib/sister-sign-in.ts).
// A plain function cached by its CDN header for a day (CLAUDE.md: a route
// handler caches only through its CDN header).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(sisterSignInJwks(), {
    headers: { "Cache-Control": "public, max-age=3600", "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
  });
}
