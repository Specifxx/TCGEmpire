import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

test("www requests permanently redirect to the canonical HTTPS host", () => {
  assert.match(source, /const CANONICAL_HOST = "riftcompare\.com"/);
  assert.match(source, /const WWW_HOST = `www\.\$\{CANONICAL_HOST\}`/);
  assert.match(source, /url\.protocol = "https:"/);
  assert.match(source, /url\.hostname = CANONICAL_HOST/);
  assert.match(source, /NextResponse\.redirect\(url, 308\)/);
});

test("the host redirect retains query strings and protects sitemap-like routes", () => {
  assert.match(source, /const url = request\.nextUrl\.clone\(\)/, "cloning preserves path and query string");
  assert.match(source, /matcher: \["\/\(\(\?!_next\/static\|_next\/image\)\.\*\)"\]/);
});
