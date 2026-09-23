import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const WORKFLOW = ".github/workflows/ci-build.yml";
const wf = read(WORKFLOW);
// Comment lines may QUOTE what the rules below forbid (the header explains the
// no-secrets rule in words); only live YAML counts.
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
  assert.doesNotMatch(live, /\bsecrets\./, `${WORKFLOW} must not reference secrets.* — point it at the postgres service`);
  assert.doesNotMatch(live, /\bvars\./, `${WORKFLOW} must not reference vars.* — a repo variable can hold a Neon URL too`);
  // And every database name the app or Prisma CLI can resolve from is set, to
  // the service — an unset RM3 would not reach Neon (nothing supplies it), but
  // it would build against no database at all and prove nothing.
  for (const name of ["DATABASE_URL", "RM3", "HISTORY_DATABASE_URL_3"]) {
    const m = new RegExp(`^\\s+${name}:\\s*(\\S+)\\s*$`, "m").exec(live);
    assert.ok(m, `${WORKFLOW} must set ${name} at job level`);
    assert.match(m[1], /^postgresql:\/\/[^@]+@localhost:5432\//, `${name} must point at the local postgres service, got ${m[1]}`);
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
});
