import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The www -> apex redirect lives in vercel.json, not middleware: middleware ran a
// billed function on every request (cached pages and /public files included) just
// to compare a Host header. See DECISIONS.md, 2026-09-25 Vercel cost entry.
const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));

test("www requests permanently redirect to the canonical HTTPS host", () => {
  const r = (vercel.redirects ?? []).find(
    (x: { has?: { type: string; value: string }[] }) =>
      x.has?.some((h) => h.type === "host" && h.value === "www.riftcompare.com"),
  );
  assert.ok(r, "vercel.json must redirect the www host");
  assert.equal(r.source, "/:path*", "every path, sitemaps and feeds included");
  assert.equal(r.destination, "https://riftcompare.com/:path*");
  assert.equal(r.permanent, true, "permanent -> 308, which keeps GET/HEAD semantics");
});

test("no middleware runs per request", () => {
  assert.ok(!existsSync(join(process.cwd(), "src/middleware.ts")));
  assert.ok(!existsSync(join(process.cwd(), "middleware.ts")));
});
