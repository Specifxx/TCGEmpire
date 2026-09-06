import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// ONE BUILD PER COMMIT.
// ─────────────────────────────────────────────────────────────────────────────
// Automated work lands as the SAME commit on two refs — a claude/<name> working
// branch, then main — so Vercel was building byte-identical source twice: a
// Preview for the branch and Production for main. Preview was the more expensive
// of the two, because package.json's build command runs a live SG price import
// when VERCEL_ENV === "preview". See docs/build-cost.md.

const vercel = JSON.parse(read("vercel.json")) as {
  git?: { deploymentEnabled?: Record<string, boolean> | boolean };
};

test("automation branches do not trigger a Vercel deployment", () => {
  const rules = vercel.git?.deploymentEnabled;
  assert.ok(rules && typeof rules === "object", "vercel.json must carry git.deploymentEnabled rules");
  const map = rules as Record<string, boolean>;
  // Both patterns, because minimatch's `*` does not cross a `/`: claude/* covers
  // claude/my-branch, claude/** also covers a nested claude/feature/thing.
  assert.equal(map["claude/*"], false, "claude/<name> branches must not auto-deploy");
  assert.equal(map["claude/**"], false, "nested claude/ branches must not auto-deploy either");
});

test("PRODUCTION deployment is never disabled by these rules", () => {
  // The failure mode that matters. Vercel's own rule is "if a branch matches
  // several rules and at least one is true, it deploys" — but a blanket
  // `deploymentEnabled: false`, or an accidental "main": false, takes the site
  // off the air on the next push and looks exactly like a broken build.
  const rules = vercel.git?.deploymentEnabled;
  assert.notEqual(rules, false, "a blanket deploymentEnabled:false would stop production deploying");
  const map = rules as Record<string, boolean>;
  for (const [pattern, enabled] of Object.entries(map)) {
    if (enabled) continue;
    assert.ok(
      pattern.startsWith("claude/"),
      `"${pattern}": false disables a branch that is not an automation branch — production must keep deploying`,
    );
  }
});

test("the preview-only price import is what made Preview the expensive build", () => {
  // Pins the reason, so that if this step is ever removed the rule above can be
  // re-argued on its real (smaller) merits rather than on a stale comment.
  const pkg = read("package.json");
  assert.match(pkg, /VERCEL_ENV==='preview'/, "the preview-only branch of the build command moved — re-check docs/build-cost.md");
  assert.match(pkg, /IMPORT_ONLY_COUNTRY=SG/, "the preview-only SG import moved — re-check docs/build-cost.md");
});

test("disabling previews did not silently delete the SEO gate", () => {
  // seo-preview-gate.yml ran ONLY on deployment.environment == 'Preview'. With
  // claude/* previews gone it would never fire again, and nothing would have
  // said so. It now accepts Production too, at the same run count (one deploy
  // per commit either way).
  const wf = read(".github/workflows/seo-preview-gate.yml");
  assert.match(wf, /environment == 'Production'/, "the SEO gate must still run somewhere after previews were disabled");
  assert.match(wf, /environment == 'Preview'/, "and must still gate a real preview when one exists");
  assert.match(wf, /template-seo-check\.ts/, "the blocking instrument must still be wired");
});
