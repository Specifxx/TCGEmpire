import { buildOpenApiSpec } from "@/lib/openapi";

// Kept working at the old location for anything that already linked here — the
// canonical route is now /openapi.json (see that route and lib/openapi.ts for
// the actual spec, shared by both so they can't drift apart).
export const revalidate = 86400;

export function GET() {
  return Response.json(buildOpenApiSpec(), {
    headers: { "X-Robots-Tag": "noindex", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" },
  });
}
