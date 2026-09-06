import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// The header's Discord icon is desktop-only (Navbar.tsx: `lg:grid`, part of
// the fix for a real 640-790px tablet overflow bug — see that file's
// breakpoint note). Below `lg` (1024px) — every phone AND the whole tablet
// band this fix targets — Discord must be reachable some other way, or the
// community invite is simply gone for the majority of visitors. The header
// comment claimed "Discord is in the footer, so no link is lost", but
// DISCORD_URL had never actually been added to NAV_GROUPS (which feeds the
// footer, the ⌘K launcher and the phone/tablet overlay menu) — so that claim
// was false. These tests lock in the fix, not just the claim.
// ─────────────────────────────────────────────────────────────────────────────

test("Discord is a real entry in NAV_GROUPS, marked external", () => {
  const code = readCode("src/components/nav-groups.ts");
  assert.match(code, /import \{ DISCORD_URL \} from "@\/lib\/site"/, "must reuse the single source of truth for the invite URL, not a second hardcoded string");
  assert.match(code, /href:\s*DISCORD_URL[\s\S]{0,200}external:\s*true/, "the Discord entry must exist and be flagged external");
});

test("every NAV_GROUPS renderer branches on `external` instead of always using next/link", () => {
  for (const [file, marker] of [
    ["src/components/FooterNav.tsx", "l.external"],
    ["src/components/CinematicNavMenu.tsx", "l.external"],
    ["src/components/CommandLauncher.tsx", "l.external"],
  ] as const) {
    const code = readCode(file);
    assert.match(code, new RegExp(marker.replace(".", "\\.")), `${file} must check the external flag`);
    assert.match(code, /target="_blank"/, `${file} must open an external nav link in a new tab, not navigate the current page away from the site`);
  }
});

test("the command launcher's Enter-key handler opens external links via window.open, not router.push", () => {
  const code = readCode("src/components/CommandLauncher.tsx");
  assert.match(code, /window\.open\(href/, "external hrefs must not go through router.push — it can only navigate internal app routes");
  const goAt = code.indexOf("const go = useCallback");
  assert.ok(goAt >= 0, "expected the go() callback");
  assert.match(code.slice(goAt, goAt + 400), /external/, "go() must accept and branch on an external flag");
});

test("llms.txt's abs() helper leaves an already-absolute external URL untouched", () => {
  // Raw source, not readCode(): the guard itself is a regex literal containing
  // "//", which readCode()'s line-comment stripper (correctly, for its own
  // purpose elsewhere) would mistake for a comment start and truncate.
  const code = read("src/app/llms.txt/route.ts");
  // Without this, an external NAV_GROUPS entry becomes
  // "https://riftcompare.comhttps://discord.gg/..." — SITE_URL blindly prepended.
  const absAt = code.indexOf("const abs = (p: string) =>");
  assert.ok(absAt >= 0, "expected the abs() helper");
  assert.match(code.slice(absAt, absAt + 200), /test\(p\)/, "abs() must test the input against a pattern before deciding whether to prefix SITE_URL");
  assert.match(code.slice(absAt, absAt + 200), /http/, "the guard must be checking for an http(s) URL");
});
