import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY OFF NEON — the export pipeline that publishes daily PriceHistory
// snapshots to the orphan `data` branch (served by jsDelivr), so every
// request-time reader (src/lib/history-store.ts, once wired in a follow-up
// PR) never opens a Postgres connection for history data. See
// scripts/export-history.ts's header and DECISIONS.md, "History off Neon".
//
// These pin the pipeline plumbing only — the export script's own math is
// exercised by history-store.test.ts once request-time readers exist.
// ─────────────────────────────────────────────────────────────────────────────

test("export-history.ts reads the history project via the shared chain, not a hand-rolled one", () => {
  const src = read("scripts/export-history.ts");
  assert.match(src, /from ["']\.\.\/src\/lib\/db-history["']/, "must import dbHistory from the shared module");
  assert.doesNotMatch(src, /new PrismaClient/, "must not construct its own Prisma client (see tests/db-chain.test.ts)");
});

test("export-history.ts scopes its default run to one Sydney day, not the whole table", () => {
  const src = read("scripts/export-history.ts");
  assert.match(src, /sydneyDay/, "must use the shared sydneyDay() boundary");
  assert.match(src, /GLOBAL_HISTORY_COUNTRY/, "must read the GLOBAL series, not a per-market one");
  // The --full flag is the ONLY path allowed to omit the day filter.
  assert.match(src, /FULL[\s\S]*?\?\s*\{[\s\S]*?country:\s*GLOBAL_HISTORY_COUNTRY\s*\}\s*:\s*\{[\s\S]*?day:\s*today/, "the incremental (non---full) query must filter on day");
});

test("refresh-prices.yml publishes today's snapshot to the data branch after the price import", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  assert.match(wf, /Export price history \(data branch\)/);
  assert.match(wf, /scripts\/export-history\.ts --out history-data/);
  assert.match(wf, /permissions:\s*\n\s*contents:\s*write/, "the job needs contents: write to push the data branch");
  // Must run after the price/sealed imports, never before (the day's snapshot
  // has to exist in Postgres before this reads it).
  const importIdx = wf.indexOf("- name: Import sealed products");
  const exportIdx = wf.indexOf("- name: Export price history (data branch)");
  assert.ok(importIdx > 0 && exportIdx > importIdx, "export step must come after the sealed-products import");
});

test("vercel.json never deploys the data branch", () => {
  const cfg = JSON.parse(read("vercel.json"));
  assert.equal(cfg.git.deploymentEnabled["data"], false);
});

test(".gitignore excludes the local history-data worktree checkout", () => {
  const gi = read(".gitignore");
  assert.match(gi, /^history-data\/?\s*$/m);
});

test("ci.yml never triggers on the data branch (only pull_request and push:main)", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.doesNotMatch(ci, /branches:\s*\n\s*-\s*data/);
});

test("maintenance.yml offers a one-off full-backfill task that seeds the data branch", () => {
  const mnt = read(".github/workflows/maintenance.yml");
  assert.match(mnt, /export-history-full/);
  assert.match(mnt, /export-history\.ts --full --out history-data/);
});
