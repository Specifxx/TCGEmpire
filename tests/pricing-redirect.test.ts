import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// /pricing → /premium, a 301 (2026-10-22, owner).
test("/pricing redirects to /premium with a 301", async () => {
  const require = createRequire(import.meta.url);
  const config = require("../next.config.js");
  const redirects: { source: string; destination: string; statusCode?: number; permanent?: boolean }[] = await config.redirects();
  const r = redirects.find((x) => x.source === "/pricing");
  assert.ok(r, "a /pricing redirect exists");
  assert.equal(r!.destination, "/premium");
  assert.equal(r!.statusCode, 301);
  assert.equal(r!.permanent, undefined, "permanent would answer 308");
});
