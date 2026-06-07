import { ADSENSE_ENABLED, adsensePubId } from "@/lib/ads";

// Serves /ads.txt. AdSense (and most ad networks) require this file to authorize
// who may sell your inventory — without it, ads may be limited or not show.
// The publisher id is derived from NEXT_PUBLIC_ADSENSE_CLIENT, so this needs no
// separate configuration. Returns 404 until a publisher id is set.
export function GET() {
  if (!ADSENSE_ENABLED) {
    return new Response("ads.txt not configured", { status: 404 });
  }

  // Standard AdSense ads.txt line. f08c47fec0942fa0 is Google's certification id.
  const body = `google.com, ${adsensePubId()}, DIRECT, f08c47fec0942fa0\n`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
