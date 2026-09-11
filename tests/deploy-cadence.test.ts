import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// ONE PRODUCTION BUILD A DAY, NOT ONE PER PUSH.
// ─────────────────────────────────────────────────────────────────────────────
// Eleven Neon projects in a row were exhausted at ~2 GB/day, and the cause was
// the deploy cadence, not a query: main received 10–30 commits a day, each a
// Vercel build that prerenders ~770 database-backed pages and clears the ISR
// page cache (DECISIONS.md, 2026-09-11; scripts/vercel-ignore-build.sh). Three
// things hold that fix together, and each is easy to undo without noticing —
// a "helpful" removal of an odd-looking ignoreCommand, a reinstated prewarm in
// generateStaticParams, a workflow rename. These pin all three.

const GATE = "scripts/vercel-ignore-build.sh";
const WORKFLOW = ".github/workflows/production-deploy.yml";
const MARKER = "[deploy]";

const vercel = JSON.parse(read("vercel.json")) as { ignoreCommand?: string };

function runGate(message: string | undefined, cwd = tmpdir()): { status: number | null; out: string } {
  // tmpdir: no git history, so ONLY the env var can supply the message. An
  // empty string is what the script treats as "unset" (its `${VAR:-}` default),
  // which also guards against the runner's own environment leaking a value in.
  const r = spawnSync("bash", [join(ROOT, GATE)], {
    cwd,
    env: { ...process.env, VERCEL_GIT_COMMIT_MESSAGE: message ?? "" },
    encoding: "utf8",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("vercel.json runs the build gate on every push", () => {
  assert.equal(
    vercel.ignoreCommand,
    `bash ${GATE}`,
    "vercel.json's ignoreCommand must invoke the gate script — without it every push is a full build again",
  );
});

test("the gate SKIPS an ordinary push (exit 0)", () => {
  const r = runGate("Fix the thing\n\nLonger body.");
  assert.equal(r.status, 0, `expected exit 0 (skip), got ${r.status}:\n${r.out}`);
});

test("the gate BUILDS a push whose message carries the marker, case-insensitively (exit 1)", () => {
  for (const msg of [`release: scheduled production deploy ${MARKER}`, "hotfix [Deploy] the checkout", "[DEPLOY]"]) {
    const r = runGate(msg);
    assert.equal(r.status, 1, `expected exit 1 (build) for ${JSON.stringify(msg)}, got ${r.status}:\n${r.out}`);
  }
});

test("the gate FAILS OPEN when the commit message is unreadable (exit 1, builds)", () => {
  // No VERCEL_GIT_COMMIT_MESSAGE and a cwd with no git history. "Never
  // deploys" is a worse failure than "deploys too often" — the latter is only
  // the status quo this gate replaces.
  const r = runGate(undefined);
  assert.equal(r.status, 1, `expected exit 1 (fail open), got ${r.status}:\n${r.out}`);
  assert.match(r.out, /fail open/i);
});

test("the scheduled release workflow supplies the marker the gate looks for", () => {
  const wf = read(WORKFLOW);
  assert.match(wf, /--allow-empty/, "the release is an empty commit — the marker has to be ON the commit Vercel sees");
  assert.ok(wf.includes(MARKER), `the release commit message must contain ${MARKER} or Vercel will skip its own release`);
  assert.match(wf, /contents:\s*write/, "pushing to main needs contents: write");
  assert.match(wf, /git push origin HEAD:main/, "the release must land on main, the branch Vercel deploys to production");
  assert.match(wf, /schedule:\s*\n\s*- cron:/, "the release must be scheduled, or nothing ever deploys");
  assert.match(wf, /workflow_dispatch/, "and manually triggerable, or a hotfix waits a day");
});

test("card pages are not prerendered at build", () => {
  // 200 full card renders per deploy, against both Neon projects, thrown away
  // by the same deploy's cache clear. The route is still ISR: an empty list
  // with dynamicParams (default true) means "render on first request".
  const src = read("src/app/card/[id]/page.tsx");
  const fn = /export (?:async )?function generateStaticParams\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src)?.[1] ?? "";
  assert.ok(fn, "generateStaticParams not found in the card page");
  assert.match(fn, /return \[\];/, "generateStaticParams must return [] — no build-time card renders");
  assert.doesNotMatch(fn, /prisma\./, "generateStaticParams must not query the database at build");
  assert.doesNotMatch(src, /export const dynamicParams\s*=\s*false/, "dynamicParams=false would 404 every card");
});

test("the egress audit can now measure the history project too", () => {
  // Until 2026-09-11 scripts/audit-egress.ts only knew the operational client,
  // so the project rotating FASTEST was the one never measured.
  const src = read("scripts/audit-egress.ts");
  assert.match(src, /--db=history/, "the --db=history flag is what lets the history project be audited");
  assert.match(src, /from "\.\.\/src\/lib\/db-history"/, "it must use the real history client, not a hand-rolled URL");
  const wf = read(".github/workflows/egress-audit.yml");
  assert.match(wf, /--db=history/, "the scheduled audit must cover the history project");
  assert.match(wf, /RH10: \$\{\{ secrets\.RH10/, "and must pass the current history variable into the job");
});
