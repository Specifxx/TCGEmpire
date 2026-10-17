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

function runGate(
  message: string | undefined,
  vercelEnv: string | undefined = "production",
  cwd = tmpdir(),
): { status: number | null; out: string } {
  // tmpdir: no git history, so ONLY the env var can supply the message. An
  // empty string is what the script treats as "unset" (its `${VAR:-}` default),
  // which also guards against the runner's own environment leaking a value in.
  const r = spawnSync("bash", [join(ROOT, GATE)], {
    cwd,
    env: { ...process.env, VERCEL_GIT_COMMIT_MESSAGE: message ?? "", VERCEL_ENV: vercelEnv ?? "" },
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

test("the gate SKIPS an ordinary production push (exit 0)", () => {
  const r = runGate("Fix the thing\n\nLonger body.", "production");
  assert.equal(r.status, 0, `expected exit 0 (skip), got ${r.status}:\n${r.out}`);
});

test("an UNKNOWN environment is treated as production and gated (exit 0)", () => {
  // VERCEL_ENV unset (system env vars off). Gating a preview by mistake costs
  // a preview URL; not gating production by mistake recreates the burn.
  const r = runGate("Fix the thing", undefined);
  assert.equal(r.status, 0, `expected exit 0 (skip), got ${r.status}:\n${r.out}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW AND DEVELOPMENT BUILDS ARE OFF (owner, 2026-10-14: "stop building
// these pages ahead of time on preview deploys"). A preview build was the full
// production pipeline against the live databases: the branch's schema pushed
// by build-db-push.sh, a Singapore price import, ~475 prerendered
// database-backed pages. It now happens only when the commit SUBJECT carries
// [preview], which a session adds only when the owner asks for a preview.
// DECISIONS.md, "Preview builds are off unless a commit asks for one".
// ─────────────────────────────────────────────────────────────────────────────

test("PREVIEW and DEVELOPMENT builds are skipped by default (exit 0)", () => {
  for (const env of ["preview", "development"]) {
    const r = runGate("Fix the thing\n\nLonger body.", env);
    assert.equal(r.status, 0, `expected exit 0 (skip) for VERCEL_ENV=${env}, got ${r.status}:\n${r.out}`);
    assert.match(r.out, /previews are off/);
  }
});

test("a preview builds when its commit SUBJECT carries [preview], case-insensitively (exit 1)", () => {
  for (const env of ["preview", "development"]) {
    for (const msg of ["Try the new header [preview]", "[Preview] sidebar rail", "[PREVIEW]", "wip [preview]\n\nA body, ignored either way."]) {
      const r = runGate(msg, env);
      assert.equal(r.status, 1, `expected exit 1 (build) for VERCEL_ENV=${env} ${JSON.stringify(msg)}, got ${r.status}:\n${r.out}`);
    }
  }
});

test("[preview] in the BODY builds no preview, and [deploy] is not a preview marker (exit 0)", () => {
  // The same subject-only rule as [deploy]: this repo's commit bodies explain
  // the markers, and prose about a marker must never act as one.
  const body = runGate("Turn previews off\n\nA preview now needs [preview] in the subject.", "preview");
  assert.equal(body.status, 0, `a body-only mention must NOT build a preview, got ${body.status}:\n${body.out}`);
  const deploy = runGate("release: scheduled production deploy [deploy]", "preview");
  assert.equal(deploy.status, 0, `[deploy] on a preview must not build it, got ${deploy.status}:\n${deploy.out}`);
});

test("an unreadable commit message never builds a preview (exit 0); production still fails open", () => {
  // Fail-open exists so PRODUCTION can never be stranded; a preview nobody
  // asked for is exactly what this gate removes.
  for (const env of ["preview", "development"]) {
    const r = runGate(undefined, env);
    assert.equal(r.status, 0, `expected exit 0 (skip) for VERCEL_ENV=${env} with no message, got ${r.status}:\n${r.out}`);
  }
  assert.equal(runGate(undefined, "production").status, 1, "production must still fail open");
});

test("[preview] does not deploy PRODUCTION (exit 0)", () => {
  for (const env of ["production", undefined]) {
    const r = runGate("Try the new header [preview]", env);
    assert.equal(r.status, 0, `expected exit 0 (skip) for VERCEL_ENV=${env ?? "unset"}, got ${r.status}:\n${r.out}`);
  }
});

test("the gate BUILDS a production push whose SUBJECT carries the marker, case-insensitively (exit 1)", () => {
  for (const msg of [
    `release: scheduled production deploy ${MARKER}`,
    "hotfix [Deploy] the checkout",
    "[DEPLOY]",
    `ship it ${MARKER}\n\nA body, which is ignored either way.`,
  ]) {
    const r = runGate(msg, "production");
    assert.equal(r.status, 1, `expected exit 1 (build) for ${JSON.stringify(msg)}, got ${r.status}:\n${r.out}`);
  }
});

test("a marker in the BODY does not deploy — prose about the gate is not the gate (exit 0)", () => {
  // This is not hypothetical. On 2026-09-11 08:29 a merge commit deployed
  // because its body read "(no [deploy] marker on purpose)" while its subject
  // had no marker at all. A literal-string search over the whole message
  // cannot tell a marker from a sentence about the marker, and this repo's
  // commit messages now routinely discuss the deploy gate.
  const real = [
    "Merge PR #106: un-nest every cached loader",
    "",
    "Ships at the next scheduled release (no [deploy] marker on purpose).",
  ].join("\n");
  const r = runGate(real, "production");
  assert.equal(r.status, 0, `a body-only mention must NOT build, got ${r.status}:\n${r.out}`);
  assert.match(r.out, /SUBJECT/, "the log line should say it looked at the subject, so the next reader knows the rule");
});

test("the scheduled release's own skip-check reads the SUBJECT too", () => {
  // It reads HEAD to answer "is main already at a release commit?". On %B, the
  // release commit's own body ("Pushes without [deploy] in their message are
  // skipped…") and any commit discussing the gate both match — the second
  // would silently skip a day's deploy.
  const wf = read(WORKFLOW);
  assert.match(wf, /git log -1 --format=%s/, "the skip-check must read the subject (%s), not the whole message (%B)");
  assert.doesNotMatch(wf, /git log -1 --format=%B/, "a %B read would match prose about the marker");
});

test("the gate FAILS OPEN when the commit message is unreadable (exit 1, builds)", () => {
  // No VERCEL_GIT_COMMIT_MESSAGE and a cwd with no git history. "Never
  // deploys" is a worse failure than "deploys too often" — the latter is only
  // the status quo this gate replaces.
  const r = runGate(undefined, "production");
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
  // by the same deploy's cache clear. Since 2026-10-17 the route is
  // force-dynamic and kept by the CDN (tests/card-cdn.test.ts), so there is no
  // generateStaticParams at all: nothing is rendered at build.
  const src = read("src/app/card/[id]/page.tsx");
  assert.match(src, /^export const dynamic = "force-dynamic";$/m);
  assert.doesNotMatch(src, /^export (?:async )?function generateStaticParams/m, "no build-time card renders");
  assert.doesNotMatch(src, /export const dynamicParams\s*=\s*false/, "dynamicParams=false would 404 every card");
});

test("the egress audit can now measure the history project too", () => {
  // Until 2026-09-11 scripts/audit-egress.ts only knew the operational client,
  // so the project rotating FASTEST was the one never measured.
  const src = read("scripts/audit-egress.ts");
  assert.match(src, /--db=history/, "the --db=history flag is what lets the history project be audited");
  assert.match(src, /from "\.\.\/src\/lib\/db-history"/, "it must use the real history client, not a hand-rolled URL");
  // The snapshot that feeds the delta must hold EVERY shape's counters: a
  // `LIMIT` there ranks by the all-time counter and hides a newly hot query
  // that has not yet climbed past the historical heavy-hitters.
  const counters = /async function readStatements\(\)[\s\S]*?`;\s*\n\}/.exec(src)?.[0] ?? "";
  assert.ok(counters, "readStatements() not found");
  assert.doesNotMatch(counters, /\bLIMIT\b/i, "readStatements() must not LIMIT the snapshot — deltas need every shape");
  assert.doesNotMatch(counters, /\bquery\b/, "readStatements() must not pull statement text — that is readStatementText()'s job, for the top slice only");
  const wf = read(".github/workflows/egress-audit.yml");
  assert.match(wf, /--db=history/, "the scheduled audit must cover the history project");
  assert.match(wf, /RH10: \$\{\{ secrets\.RH10/, "and must pass the current history variable into the job");
});

test("the daily release follows the public data snapshot, with a late fallback (2026-10-15)", () => {
  // GitHub started the 07:00 import and the 08:00 release 5-9 hours late, and the
  // release kept landing minutes BEFORE the snapshot, so files mode served the
  // previous day's data. The import now dispatches the release after publishing.
  const prices = readFileSync(join(process.cwd(), ".github/workflows/refresh-prices.yml"), "utf8");
  const exportAt = prices.indexOf("- name: Export and publish the public data snapshot");
  const releaseAt = prices.indexOf("- name: Release the snapshot (the daily production deploy)");
  assert.ok(exportAt > 0 && releaseAt > exportAt, "the release step comes after the export step");
  assert.match(prices, /id: export\n/);
  assert.match(prices, /if: \$\{\{ !cancelled\(\) && steps\.export\.outcome == 'success' \}\}/, "only after a successful export");
  assert.match(prices, /gh workflow run production-deploy\.yml --ref main/);
  assert.match(prices, /actions: write/, "dispatching a workflow needs actions: write");
  const wf = readFileSync(join(process.cwd(), WORKFLOW), "utf8");
  assert.match(wf, /cron: "0 22 \* \* \*"/, "the schedule is the late fallback, not a race with the import");
  assert.match(wf, /git log --since='20 hours ago' --format=%s \| grep -ciF -- '\[deploy\]'/, "the fallback skips when a release already landed");
});
