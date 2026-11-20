// The sister-site scanner read (lib/scan/sister.ts, /api/scan/read; DECISIONS.md 2026-11-20).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sisterScanConfig, sisterScanCors, sisterScanSite, sisterVisitorKey } from "../src/lib/scan/sister";

test("only the exact https sister origin is allowed", () => {
  assert.equal(sisterScanSite("https://tcgsinglesdb.com")?.key, "sdb");
  assert.equal(sisterScanSite("https://www.tcgsinglesdb.com")?.key, "sdb");
  assert.equal(sisterScanSite("http://tcgsinglesdb.com"), null);
  assert.equal(sisterScanSite("https://tcgsinglesdb.com.evil.io"), null);
  assert.equal(sisterScanSite("https://evil-tcgsinglesdb.com"), null);
  assert.equal(sisterScanSite(null), null);
  assert.equal(sisterScanCors("https://evil.io")["Access-Control-Allow-Origin"], undefined);
  assert.equal(sisterScanCors("https://tcgsinglesdb.com")["Access-Control-Allow-Origin"], "https://tcgsinglesdb.com");
});

test("caps: off without the key, 5 a visitor and 500 a day by default", () => {
  assert.equal(sisterScanConfig({}).enabled, false);
  assert.equal(sisterScanConfig({ ANTHROPIC_API_KEY: "k", SISTER_SCAN: "0" }).enabled, false);
  const c = sisterScanConfig({ ANTHROPIC_API_KEY: "k" });
  assert.deepEqual(c, { enabled: true, dailyCap: 500, perVisitor: 5 });
});

test("the visitor key never holds the IP", () => {
  const k = sisterVisitorKey("sdb", "203.0.113.9", "2026-11-20", "salt");
  assert.ok(!k.includes("203.0.113.9"));
  assert.notEqual(k, sisterVisitorKey("sdb", "203.0.113.9", "2026-11-20", "other"));
  assert.match(k, /^scan:sis:sdb:v:[0-9a-f]{20}:2026-11-20$/);
});

test("the route reads no session and stores no photo", () => {
  const src = readFileSync("src/app/api/scan/read/route.ts", "utf8");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.ok(!/getCurrentUser|cookies\(|lib\/ebay/.test(code));
  assert.ok(!/\.create\(\{\s*data:\s*\{[^}]*image/.test(src));
});
