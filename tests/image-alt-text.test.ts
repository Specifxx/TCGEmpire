import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// An SEO/accessibility audit found images with no meaningful alt text. Every
// `<img>` in this codebase already falls into one of two correct shapes:
//
//   1. Real content (`alt={someExpression}` or a non-empty literal) — the
//      normal case, most images.
//   2. A thumbnail sitting directly beside text that already fully describes
//      it (a card name + set/collector number, a user's own display name) —
//      correctly `alt="" aria-hidden="true"` TOGETHER, so it's genuinely
//      removed from the accessibility tree rather than left as an unlabelled
//      image a screen reader still announces.
//
// EbayGradedLive.tsx and two page files had shape 2's `alt=""` WITHOUT the
// `aria-hidden` companion — an unlabelled image in the a11y tree, not a
// deliberate decorative one. This test pins the pairing repo-wide so a future
// `alt=""` can't reintroduce the same gap one tag at a time.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(e)) out.push(p);
  }
  return out;
}

test("every empty alt=\"\" is paired with aria-hidden=\"true\" on the same tag", () => {
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    // Route-handler opengraph-image.tsx files render via Next's ImageResponse
    // (satori), never as real HTML <img> a browser or screen reader sees —
    // alt there is inert, so this invariant doesn't apply to them.
    if (/opengraph-image\.tsx$/.test(file)) continue;
    for (const m of src.matchAll(/<img\b[^>]*>/gs)) {
      const tag = m[0];
      if (!/\balt=""/.test(tag)) continue; // only the empty-literal case
      if (/aria-hidden="true"/.test(tag)) continue; // correctly paired
      const line = src.slice(0, m.index).split("\n").length;
      offenders.push(`${relative(ROOT, file)}:${line}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "alt=\"\" without aria-hidden=\"true\" leaves an unlabelled image in the accessibility " +
      "tree — either pair it with aria-hidden (if a sibling element already describes it) " +
      "or give it real alt text:\n" + offenders.join("\n"),
  );
});

test("no <img>/<Image> tag is missing alt entirely (comments mentioning <img> don't count)", () => {
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    if (/opengraph-image\.tsx$/.test(file)) continue;
    // Strip comments first (both styles) so prose like "a plain <img> rather
    // than next/image" or a block comment mentioning "<picture> rather than a
    // bare <img>" (both used throughout this codebase to justify skipping
    // next/image) can never fool the tag scan below.
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const m of stripped.matchAll(/<(img|Image)\b[^>]*?\/?>/gs)) {
      const tag = m[0];
      if (/\balt\s*=/.test(tag) || /\{\.\.\./.test(tag)) continue; // has alt, or spreads props that might carry it
      const line = stripped.slice(0, m.index).split("\n").length;
      offenders.push(`${relative(ROOT, file)}:${line}  ${tag.slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], "found <img>/<Image> tag(s) with no alt prop at all:\n" + offenders.join("\n"));
});
