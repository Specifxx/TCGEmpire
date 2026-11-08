import { storeCheck } from "@/lib/link-check-index";

// /api/check/<host>: one store's listings for the "Is this a good price?" checker (components/LinkChecker.tsx,
// 2026-11-08). Read from the release's bundled public data files only (lib/link-check-index.ts), never Neon, and the
// pasted page is never fetched. A plain function cached by the CDN for a day (a route handler caches only through its
// header); a host we don't read is a 404, cached the same day.
export const dynamic = "force-dynamic";

const CDN = "public, s-maxage=86400, stale-while-revalidate=86400";

export function GET(_req: Request, { params }: { params: { host: string } }) {
  let host = "";
  try {
    host = decodeURIComponent(params.host).slice(0, 253);
  } catch {
    return new Response("Bad host", { status: 400 });
  }
  const body = storeCheck(host);
  if (body === null) return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!body) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN } });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN } });
}
