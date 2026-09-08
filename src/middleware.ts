import { type NextRequest, NextResponse } from "next/server";

// `metadataBase` and every canonical URL use this host.  Keeping an equivalent
// `www` response live would make a second crawlable copy of every page, and a
// canonical tag is only a hint once that happens.  The redirect is deliberately
// at the edge so it also covers routes that do not render the application
// layout (sitemaps, feeds, robots.txt, and IndexNow's key file).
const CANONICAL_HOST = "riftcompare.com";
const WWW_HOST = `www.${CANONICAL_HOST}`;

function requestHost(request: NextRequest): string {
  // Use Host rather than nextUrl.hostname: in local development Next normalises
  // nextUrl to localhost, while Host is the authority Vercel received.  Strip a
  // port and a legal DNS trailing dot so neither can leave a duplicate host.
  return (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function middleware(request: NextRequest) {
  if (requestHost(request) !== WWW_HOST) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";

  // 308 preserves GET/HEAD semantics and preserves query strings, which matters
  // for shareable card/deck links while still communicating a permanent move to
  // Google, Bing, and every HTTP cache.
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Static build assets do not need a canonical response.  Public machine
  // surfaces remain included because search engines fetch them directly.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
