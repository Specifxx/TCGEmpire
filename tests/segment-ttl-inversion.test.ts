import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "src/app");
const SRC = join(ROOT, "src");
const COMPONENTS = join(SRC, "components");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "page.tsx" || e === "route.ts") out.push(p);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SEGMENT-TTL INVERSION — the single most expensive bug in this repo's
// history, and completely invisible in review.
//
// An `unstable_cache` entry does NOT get a private TTL. Next sets
// `store.revalidate = options.revalidate` unless the store's is already smaller
// (server/web/spec-extension/unstable-cache.js), so the SHORTEST inner TTL
// becomes the TTL of the whole SEGMENT — including every UNCACHED query sitting
// beside it. One `{ revalidate: 300 }` on a `revalidate = 86400` page re-runs
// that entire page 288× a day instead of once.
//
// Cost, measured: components/EbayCardPanel.tsx did this to /card/[id] until
// 2026-08-14 — ~10 uncached round trips × ~60 KB × 288 × ~200 hot card URLs
// ≈ 2 GB/day, which matched the observed Neon burn almost exactly. Nine Neon
// projects have now been exhausted at roughly that rate.
//
// The 2026-08-14 sweep fixed /card/[id] and MISSED /movers, which sat at
// `{ revalidate: 600 }` under `export const revalidate = 86400` — 144× a day —
// until 2026-08-22. A one-off grep is evidently not enough; hence this test.
//
// If a surface genuinely needs fresher data than its page, fetch it CLIENT-side.
// That is the only way a TTL cannot propagate to the segment. Raising the page's
// own `export const revalidate` down to match is also fine — what must never
// happen is the two disagreeing, because only one of them is real.
// ─────────────────────────────────────────────────────────────────────────────

test("no unstable_cache TTL undercuts its own route's export const revalidate", () => {
  const offenders: string[] = [];

  for (const file of walk(APP)) {
    const src = readFileSync(file, "utf8");
    const page = /^export const revalidate\s*=\s*(\d[\d_]*)/m.exec(src);
    if (!page) continue; // dynamic or force-dynamic — no segment TTL to undercut
    const pageTtl = Number(page[1].replace(/_/g, ""));

    for (const m of src.matchAll(/revalidate:\s*(\d[\d_]*)/g)) {
      const inner = Number(m[1].replace(/_/g, ""));
      if (inner >= pageTtl) continue;
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(
        `${relative(ROOT, file)}:${line} — inner revalidate=${inner} under page revalidate=${pageTtl} ` +
          `(segment regenerates ${Math.floor(pageTtl / inner)}x more often than declared)`
      );
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "an inner cache TTL below the page's drags the WHOLE segment down to it — every uncached query on the page re-runs at the shorter interval:\n" +
      offenders.join("\n")
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-FILE: the shape that actually caused the incident.
// ─────────────────────────────────────────────────────────────────────────────
// EbayCardPanel.tsx — the file the bug above is named after — lives in
// src/components, not src/app. The same-file test can never see a cache TTL
// that lives in a RENDERED COMPONENT rather than the page.tsx itself; a
// literal reintroduction of that exact bug would pass it today. This test
// resolves each page's local imports into src/components (recursively, so a
// component that renders another component is covered too) and applies the
// same comparison there.
//
// SCOPED TO src/components, not src/lib (2026-09-14, DECISIONS.md "Find the
// fifth burn before RM10 dies"). An earlier version of this test also walked
// src/lib's import graph and produced dozens of "offenders" that were really
// just shared modules (src/lib/db.ts, src/lib/price-history.ts) transitively
// reachable from routes that never call the specific cached function inside
// them — importing a file is not the same as calling the function in it that
// happens to hold a cache. A RENDERED component is a tighter, more accurate
// signal: if it's imported by the page it is (almost always) in the render
// tree, and its own top-level unstable_cache calls run on that page's render.
// Verified against the actual incident: reintroducing EbayCardPanel's old
// `{ revalidate: 300 }` here is caught; the real, current codebase reports
// zero offenders.
//
// Also treats a MISSING `export const revalidate` on a page.tsx as effectively
// Infinity, not "skip" — Next's default for a page with no revalidate/dynamic
// config is static, so an inner component cache still drags it down to a real,
// finite TTL; the old same-file-only test could not see this either (see
// src/app/learn/page.tsx's history — fixed by declaring its TTL explicitly).
// route.ts is excluded from the implicit-Infinity rule: most route handlers
// with no revalidate are mutation endpoints (login, logout, webhooks) with no
// segment-TTL concept at all, and treating every one of those as "Infinity"
// reintroduced the same false-positive problem the src/lib walk had.

const stripComments = (s: string) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

const fileCache = new Map<string, { code: string }>();
function loadCode(file: string): string | null {
  const cached = fileCache.get(file);
  if (cached) return cached.code;
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const code = stripComments(raw);
  fileCache.set(file, { code });
  return code;
}

function resolveImportSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(fromFile), spec);
  else return null; // an npm package, not part of this source tree
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function isUnderComponents(p: string): boolean {
  const r = resolve(p);
  return r === resolve(COMPONENTS) || r.startsWith(`${resolve(COMPONENTS)}/`);
}

function localImportSpecs(code: string): string[] {
  const specs: string[] = [];
  for (const m of code.matchAll(/import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g)) specs.push(m[1]);
  return specs;
}

// Every src/components file reachable from `entry` (itself excluded), depth-
// capped so a pathological import cycle can't loop forever.
function componentClosure(entry: string, maxDepth = 6): string[] {
  const depthOf = new Map<string, number>();
  const queue: [string, number][] = [[entry, 0]];
  while (queue.length) {
    const [file, d] = queue.shift()!;
    const seen = depthOf.get(file);
    if (seen !== undefined && seen <= d) continue;
    depthOf.set(file, d);
    if (d >= maxDepth) continue;
    const code = loadCode(file);
    if (code == null) continue;
    for (const spec of localImportSpecs(code)) {
      const dep = resolveImportSpec(spec, file);
      if (!dep || !isUnderComponents(dep)) continue;
      const depSeen = depthOf.get(dep);
      if (depSeen === undefined || depSeen > d + 1) queue.push([dep, d + 1]);
    }
  }
  depthOf.delete(entry);
  return [...depthOf.keys()];
}

// Resolves a `revalidate:` value that isn't a bare digit literal — a product of
// two literals (`8 * 86400`) or a locally-defined named constant, one hop
// through its own definition. Anything it can't resolve returns null and is
// skipped rather than guessed at.
function resolveNumeric(expr: string, code: string, depth = 0): number | null {
  const e = expr.trim();
  if (/^\d[\d_]*$/.test(e)) return Number(e.replace(/_/g, ""));
  const product = /^(\d[\d_]*)\s*\*\s*(\d[\d_]*)$/.exec(e);
  if (product) return Number(product[1].replace(/_/g, "")) * Number(product[2].replace(/_/g, ""));
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(e) && depth < 3) {
    const def = new RegExp(`const\\s+${e}\\s*=\\s*([^;\\n]+)`).exec(code);
    if (def) return resolveNumeric(def[1], code, depth + 1);
  }
  return null;
}

test("no component rendered by a page carries a revalidate below that page's own", () => {
  const offenders: string[] = [];

  for (const pageFile of walk(APP)) {
    const isPage = pageFile.endsWith("page.tsx");
    const code = loadCode(pageFile);
    if (code == null) continue;
    if (/export const dynamic\s*=\s*["']force-dynamic["']/.test(code)) continue;
    const page = /^export const revalidate\s*=\s*(\d[\d_]*)/m.exec(code);
    let pageTtl: number;
    if (page) pageTtl = Number(page[1].replace(/_/g, ""));
    else if (isPage) pageTtl = Infinity; // an undeclared page.tsx is effectively static
    else continue; // route.ts with neither — not this test's concern (see header)

    for (const file of componentClosure(pageFile)) {
      const innerCode = loadCode(file);
      if (innerCode == null) continue;
      for (const m of innerCode.matchAll(/revalidate:\s*([^,\n}]+)/g)) {
        const inner = resolveNumeric(m[1], innerCode);
        if (inner == null || inner >= pageTtl) continue;
        const line = innerCode.slice(0, m.index).split("\n").length;
        offenders.push(
          `${relative(ROOT, pageFile)} (page revalidate=${pageTtl === Infinity ? "∞ (undeclared)" : pageTtl}) renders ` +
            `${relative(ROOT, file)}:${line} (revalidate=${inner}) — the component's cache TTL drags the whole page down to it`,
        );
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});
