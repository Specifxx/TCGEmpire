import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// CARD PAGES LEAVE ISR FOR THE CDN (2026-10-17, DECISIONS.md). A card page is
// ~550 KB of HTML + RSC, ~70 ISR write units every time it was written, and
// every release emptied the ISR cache. Now it renders per request and Vercel's
// CDN keeps one copy per card for a day (next.config.js, CARD_CDN_CACHE).
//
// ONE COPY SERVES EVERY VISITOR, so nothing the page's server render can reach
// may read the visitor: no cookie, no request header, no session, no
// getCountry(). This walks the page's server imports and the layouts above it.
// A client component ("use client") is skipped: it cannot read next/headers.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const PAGE = "src/app/card/[id]/page.tsx";
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
function serverClosure(entries: string[]): string[] {
  const seen = new Set<string>(), stack = entries.map((e) => join(ROOT, e));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    if (/^\s*["']use client["']/.test(src)) continue;
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"`]*?\sfrom\s+)?["']([^"']+)["']/g)) {
      const r = resolveSpec(f, m[1]!);
      if (r && /\.tsx?$/.test(r)) stack.push(r);
    }
  }
  return [...seen].map((f) => relative(ROOT, f));
}

test("the card page renders per request and the CDN keeps it a day; no ISR", async () => {
  const src = read(PAGE);
  assert.match(src, /^export const dynamic = "force-dynamic";$/m);
  assert.doesNotMatch(src, /^export const revalidate\b|^export (?:async )?function generateStaticParams/m);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require(join(ROOT, "next.config.js")) as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  const rule = (await cfg.headers()).find((h) => h.source === "/card/:id");
  assert.deepEqual(rule?.headers, [{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=86400, stale-while-revalidate=86400" }]);
});

test("nothing the card page's server render reaches reads the visitor (one CDN copy serves everyone)", () => {
  const layouts = ["src/app/layout.tsx", "src/app/card/layout.tsx", "src/app/card/[id]/layout.tsx"].filter((p) => existsSync(join(ROOT, p)));
  const files = serverClosure([PAGE, ...layouts]);
  assert.ok(files.length > 20, `walked ${files.length} files`);
  const offenders: string[] = [];
  for (const f of files) {
    const src = read(f).replace(/\/\/.*$/gm, "");
    if (/from ["']next\/headers["']/.test(src)) offenders.push(`${f}: imports next/headers`);
    const call = /(?<![.\w])(getCountry|getCurrentUser|getSessionUser|readSession)\s*\(/.exec(src);
    if (call) offenders.push(`${f}: calls ${call[1]}()`);
    if (/searchParams/.test(src) && f === PAGE) offenders.push(`${f}: reads searchParams`);
  }
  assert.deepEqual(offenders, [], "a per-visitor read here would put one visitor's page in every visitor's CDN copy");
});
