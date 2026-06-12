import { INDEXNOW_KEY } from "@/lib/indexnow";

// IndexNow key file. Search engines fetch this to verify that the IndexNow pings
// we send (lib/indexnow.ts) are authorised for this host: the file must simply
// return the key. Static — the key only changes with a deploy.
export const dynamic = "force-static";

export function GET() {
  return new Response(INDEXNOW_KEY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
