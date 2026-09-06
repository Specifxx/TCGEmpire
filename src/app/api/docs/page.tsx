import type { Metadata } from "next";
import Link from "next/link";
import { buildOpenApiSpec } from "@/lib/openapi";
import { SITE_URL } from "@/lib/site";

// Human-readable companion to /openapi.json — generated FROM the same spec
// object (see lib/openapi.ts) so the two can never say different things about
// the same endpoint. Not linked from the main nav (it's a developer reference,
// not a marketing page) and outside robots.txt's /api/v1/ allow-list like every
// other /api/ path, so it's reachable directly but not crawled — see robots.ts.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "API Reference",
  description: "The public RiftCompare data API: endpoints, parameters and response shapes.",
  robots: { index: false, follow: true },
};

function methodBadge(method: string) {
  return (
    <span className="chip num shrink-0 bg-brand-500/15 font-mono text-[11px] uppercase text-brand-300">
      {method}
    </span>
  );
}

export default function ApiDocsPage() {
  const spec = buildOpenApiSpec();
  const entries = Object.entries(spec.paths);

  return (
    <div className="mx-auto max-w-3xl py-6">
      <h1 className="text-2xl font-extrabold text-white">{spec.info.title}</h1>
      <p className="mt-1 text-sm text-slate-400">v{spec.info.version}</p>
      <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-300">{spec.info.description}</div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <a href="/openapi.json" className="text-brand-400 hover:underline">
          Full machine-readable spec (OpenAPI 3.1 JSON) →
        </a>
        <span className="text-ink-700">·</span>
        <Link href="/llms.txt" className="text-brand-400 hover:underline">
          llms.txt →
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {entries.map(([path, methods]) => (
          <div key={path} id={path} className="card-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(methods as unknown as Record<string, { summary?: string; operationId?: string }>).map(([method, op]) => (
                <span key={method} className="flex items-center gap-2">
                  {methodBadge(method)}
                  <code className="font-mono text-sm text-white">{path}</code>
                </span>
              ))}
            </div>
            {Object.entries(methods as unknown as Record<string, { summary?: string; description?: string; operationId?: string; parameters?: { name: string; in: string; required?: boolean; description?: string; schema?: { type?: string; enum?: string[]; default?: unknown } }[] }>).map(
              ([method, op]) => (
                <div key={method} className="mt-2">
                  <p className="text-sm font-semibold text-slate-200">{op.summary}</p>
                  {op.description && <p className="mt-1 text-xs text-slate-400">{op.description}</p>}
                  {op.parameters && op.parameters.length > 0 && (
                    <table className="mt-3 w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="pb-1 pr-3 font-medium">Param</th>
                          <th className="pb-1 pr-3 font-medium">In</th>
                          <th className="pb-1 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {op.parameters.map((p) => (
                          <tr key={p.name} className="border-t border-ink-800">
                            <td className="py-1 pr-3 font-mono text-slate-300">
                              {p.name}
                              {p.required && <span className="text-down"> *</span>}
                            </td>
                            <td className="py-1 pr-3 text-slate-500">{p.in}</td>
                            <td className="py-1 text-slate-400">
                              {p.description}
                              {p.schema?.enum && (
                                <span className="text-slate-600"> ({p.schema.enum.join(" | ")})</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <code className="mt-3 block overflow-x-auto rounded-md bg-ink-950 px-3 py-2 font-mono text-[11px] text-slate-400">
                    curl {SITE_URL}
                    {path.replace(/\{(\w+)\}/g, ":$1")}
                  </code>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
