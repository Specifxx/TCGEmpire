import { buildOpenApiSpec } from "@/lib/openapi";

// Canonical OpenAPI 3.1 description of the public data API (see lib/openapi.ts).
// Root-level so it's where an agent framework or MCP client expects to find it
// by convention; /api/v1/openapi.json still works too, same content.
export const revalidate = 86400;

export function GET() {
  return Response.json(buildOpenApiSpec(), {
    headers: { "X-Robots-Tag": "noindex", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" },
  });
}
