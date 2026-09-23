import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HISTORY_VARS, OPERATIONAL_VARS } from "../src/lib/db-chains";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const WORKFLOW = ".github/workflows/ci-build.yml";
const wf = read(WORKFLOW);
// YAML comment lines may DESCRIBE what the structural rules below look for
// (the header explains the no-database rule in words), so those rules read
// only live YAML. The secrets./vars. bans are the exception and read the whole
// file — see the first test.
const live = wf
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// A REAL PRODUCTION BUILD IN CI — AND ONE THAT CAN NEVER REACH NEON.
//
// ci.yml never ran `next build`, so failures that only the build can see went
// straight to production: a route file exporting a name Next doesn't recognise
// passes `tsc` and fails `next build` (why lib/gallery-seo.ts and
// lib/hot40-og.tsx exist), and a homepage that server-rendered nothing
// typechecked, built and shipped blank (scripts/smoke-pages.ts's header:
// "Nothing in CI could have caught it"). ci-build.yml builds and smokes every
// PR and every push to main.
//
// The build prerenders hundreds of database-backed pages, which is exactly the
// load CLAUDE.md's deploy gate rations: unnecessary builds against production
// burned a Neon project's transfer allowance every three days (DECISIONS.md,
// 2026-09-11). Run on every PR against a real database, this job would be the
// worst burn the repo has had. So it talks only to a throwaway Postgres service
// with the synthetic seed, and it must reference NO secret: with no Neon URL in
// the process it cannot reach one even by mistake. These pin that, and that the
// job still does the two things it exists for.
// ─────────────────────────────────────────────────────────────────────────────

test("ci-build.yml references no secrets, so it can never reach a production database", () => {
  // Any `secrets.X` — in `${{ }}`, a `with:` input or an `env:` value — is a
  // way for a real connection string to enter the job. `vars.` too: the RM3
  // cutover wired `secrets.RM3 || vars.RM3` elsewhere, and a repo variable can
  // hold a URL just as well.
  //
  // Both read the WHOLE file, comment lines included (review, 2026-09-23).
  // GitHub evaluates `${{ }}` inside a `run: |` block before the shell sees
  // it, and a `#` line there is a SHELL comment, not a YAML one: a leftover
  // `# ${{ secrets.RM3 }}` in a script writes the Neon URL into the job. The
  // file has no occurrence at all today, comments included, so nothing needs
  // the exemption; this is the brief's `grep -c 'secrets\.'` = 0, as a test.
  assert.doesNotMatch(wf, /\bsecrets\./, `${WORKFLOW} must not reference secrets.* — point it at the postgres service`);
  assert.doesNotMatch(wf, /\bvars\./, `${WORKFLOW} must not reference vars.* — a repo variable can hold a Neon URL too`);

  // Every name a database resolves from points at the service EVERYWHERE the
  // file assigns it: the job env, a step-level `env:` override, or an inline
  // `NAME=… cmd` / `export NAME=…` in a script. This used to check only the
  // first `NAME:` line, so a step-level
  // `DATABASE_URL: postgresql://…@ep-x.neon.tech/neondb` on the seed step
  // passed (review, 2026-09-23). The names come from db-chains.ts, so a
  // retired rollback name reappearing here is held to the same rule.
  const SERVICE = /^postgresql:\/\/[^@\s]+@localhost:5432\/\S*$/;
  const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2");
  const names = [...new Set(["DATABASE_URL", ...OPERATIONAL_VARS, ...HISTORY_VARS])];
  for (const name of names) {
    const assigned = [
      ...live.matchAll(new RegExp(`^\\s+${name}:(.*)$`, "gm")),
      ...live.matchAll(new RegExp(`\\b${name}=(\\S*)`, "g")),
    ];
    for (const m of assigned) {
      assert.match(unquote(m[1]), SERVICE, `${name} must point at the local postgres service wherever it is set, got ${m[0].trim()}`);
    }
  }

  // And the heads of both chains, plus DATABASE_URL, are set in the job-level
  // env (6-space indent). The heads are read from db-chains.ts, not written
  // here: the names rotate every few days, and the next rotation must fail
  // this test until the workflow follows it, as tests/db-chain.test.ts does
  // for build-db-push.sh. A stale head never reaches Neon — nothing supplies
  // the new name, db.ts hands Prisma `datasourceUrl: undefined`, and Prisma
  // falls back to schema.prisma's DATABASE_URL, the same service. It is
  // quietly WRONG instead: every build worker logs "current project missing",
  // and a stale operational head flips historyIsSplit to true (history
  // resolves to the service URL, operational to undefined), so CI runs a path
  // neither production nor local dev takes.
  for (const name of new Set(["DATABASE_URL", OPERATIONAL_VARS[0], HISTORY_VARS[0]])) {
    assert.match(live, new RegExp(`^ {6}${name}:`, "m"), `${WORKFLOW} must set ${name} in the job-level env (db-chains.ts's current head)`);
  }
});

test("ci-build.yml builds against a postgres service, not an external database", () => {
  assert.match(live, /^\s+services:\s*\n\s+postgres:\s*\n\s+image:\s*postgres:\d+/m, "a postgres service container is the job's only database");
  assert.match(live, /--health-cmd/, "the service needs a health check, or the schema push races the container's startup");
  // The schema and the synthetic seed are what give the build real pages to
  // prerender; without them every DB-backed page renders its error state.
  assert.match(live, /npx prisma db push --skip-generate/);
  assert.match(live, /npx tsx prisma\/seed\.ts/);
});

test("ci-build.yml runs the production build, starts it, and smokes the rendered pages", () => {
  // `npm run build`, not bare `next build`, so CI builds what Vercel builds —
  // the AdSense and image guards included.
  assert.match(live, /run: npm run build\b/, "the job must run the production build");
  assert.match(live, /npx next start -p 3000/, "the smoke needs the BUILT app, not `next dev`");
  assert.match(live, /localhost:3000\/api\/ping/, "wait for /api/ping (it runs SELECT 1) before smoking");
  assert.match(live, /npx tsx scripts\/smoke-pages\.ts http:\/\/localhost:3000/, "the job must smoke the pages it just built");
  assert.match(live, /timeout-minutes:\s*\d+/, "a hung server must fail the check, not hold a runner for six hours");
  // A failed build piped into `tee` PASSES under the default `run` shell
  // (`bash -e {0}`, no pipefail): tee exits 0, so the step is green and the
  // smoke then runs against whatever `next start` finds. `shell: bash` is what
  // switches on `-o pipefail`. Each `- name:` / `- uses:` opens a step.
  const steps = live.split(/\n\s+- (?=name:|uses:)/);
  const build = steps.find((s) => /run: npm run build\b/.test(s)) ?? "";
  if (/npm run build[^\n]*\|\s*tee\b/.test(build)) {
    assert.match(build, /shell:\s*bash\b/, "a build piped into tee needs `shell: bash` (pipefail), or a failed build passes");
  }

  // Present is not the same as gating (review, 2026-09-23): `if: false` on the
  // build, `continue-on-error: true` on the smoke, or a trailing `|| true`
  // each left every assertion above green while the check stopped failing on
  // anything. steps[0] is everything before the first step — the job header.
  assert.doesNotMatch(steps[0], /^\s+(if|continue-on-error):/m, "the job itself must not be conditional or allowed to fail");
  for (const [what, marker] of [
    ["build", /run: npm run build\b/],
    ["start", /npx next start -p 3000/],
    ["smoke", /scripts\/smoke-pages\.ts/],
  ] as const) {
    const step = steps.find((s) => marker.test(s));
    assert.ok(step, `no ${what} step found`);
    assert.doesNotMatch(step, /^\s+continue-on-error:/m, `the ${what} step must fail the check when it fails`);
    assert.doesNotMatch(step, /^\s+if:/m, `the ${what} step must run on every build — an \`if:\` can switch it off`);
    if (what !== "start") {
      assert.doesNotMatch(step, /\|\|/, `the ${what} step must not swallow its exit status with \`||\``);
    }
  }
  // --allow-404 lets an `optional` page 404 without failing; CI builds the
  // branch's own routes, so nothing it smokes can be "not deployed yet".
  assert.doesNotMatch(live, /smoke-pages\.ts[^\n]*--allow-404/, "CI must not smoke with --allow-404");
});

test("the smoke runs in SMOKE_SEED mode in CI, and that mode keeps every structural floor", () => {
  assert.match(live, /SMOKE_SEED:\s*1/, "the seed has no Vendetta and no real prices — CI must opt into the seed expectations");
  // The relaxation lives in smoke-pages.ts and may only swap data-dependent
  // expectations. The floors that caught the blank-homepage incident — 200,
  // exactly one <h1>, visible text, internal links — are applied to every
  // page in both modes, so they must stay unconditional.
  const smoke = read("scripts/smoke-pages.ts");
  assert.match(smoke, /process\.env\.SMOKE_SEED/, "smoke-pages.ts must read SMOKE_SEED");
  for (const floor of [
    /if \(status !== 200\) problems\.push/,
    /const wantH1 = c\.h1 \?\? 1;\s*\n\s*if \(h1s !== wantH1\) problems\.push/,
    /if \(text\.length < minText\) problems\.push/,
    /if \(links < minLinks\) problems\.push/,
  ]) {
    assert.match(smoke, floor, `smoke-pages.ts lost a structural floor: ${floor}`);
  }
  // A seed override may retarget a check (path/label) or swap its required
  // copy (must) — never carry a floor. Widening this type is how SMOKE_SEED
  // would quietly become "SMOKE_LENIENT"; do it only with a reason written
  // next to it in smoke-pages.ts's header.
  assert.match(
    smoke,
    /seed\?: \{ path\?: string; label\?: string; must\?: string\[\] \};/,
    "the `seed` override must stay limited to path, label and must",
  );
  // The type alone does not stop it: the MERGE can add fields of its own.
  // `{ ...base, ...base.seed, minLinks: 0, minText: 0 }` typechecks and zeroes
  // two floors for every page in seed mode (review, 2026-09-23). So the merge
  // is pinned exactly — base first, the seed override on top, nothing else.
  assert.match(
    smoke,
    /const c: Check = SEED && base\.seed \? \{ \.\.\.base, \.\.\.base\.seed \} : base;/,
    "seed mode may only overlay `base.seed` onto the check — no extra fields in the merge",
  );
  // And a failure still fails the process — the workflow step gates on the
  // exit code alone.
  assert.match(smoke, /if \(failures\) \{\n[^\n]*\n\s*process\.exit\(1\);/, "smoke-pages.ts must exit 1 when any page fails");
});
