#!/usr/bin/env tsx
/**
 * Build-time image guard. Runs from `npm run build` AFTER scripts/optimize-images.ts,
 * and FAILS THE BUILD (exit 1) on either of the two issue classes the SEO audit
 * found — so neither can come back.
 *
 *   1. LARGE IMAGES — no file served out of public/ may exceed 150 KB.
 *      optimize-images.ts already shrinks everything it can; this is the backstop
 *      for an image it couldn't help (an animated GIF, an SVG bomb) or for a build
 *      where sharp wasn't installed and optimisation silently no-op'd.
 *
 *   2. MISSING ALT TEXT — every <img> and every next/image <Image> in src/ must
 *      carry an `alt` attribute. An explicitly EMPTY alt is allowed (that is the
 *      correct markup for a decorative image and is what several card-row
 *      thumbnails legitimately use); an ABSENT one is not, because a missing alt
 *      is what assistive tech and crawlers both fall over on.
 *      Article markdown is checked too: `![](…)` with no alt fails, because the
 *      <Markdown> renderer passes that straight through to the <img>.
 *
 * Deliberately dependency-free and DB-free so it runs identically on a laptop, in
 * CI, and on Vercel.
 */
import fs from "node:fs";
import path from "node:path";
import { MAX_BYTES } from "./image-budget";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const SRC_DIR = path.join(ROOT, "src");

const SERVED_IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;

const problems: string[] = [];
let checked = 0;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

// ── 1. size budget ────────────────────────────────────────────────────────────
for (const file of walk(PUBLIC_DIR).filter((f) => SERVED_IMAGE.test(f))) {
  checked++;
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_BYTES) {
    problems.push(
      `LARGE IMAGE  ${path.relative(ROOT, file)} is ${Math.round(bytes / 1024)}KB ` +
        `(budget ${MAX_BYTES / 1024}KB). Run \`npm run images:optimize\`, or resize the source.`
    );
  }
}

// ── 2. alt attributes in JSX and in template-literal HTML ─────────────────────
/**
 * Blank out COMMENTS ONLY, preserving every character position so reported line
 * numbers stay right.
 *
 * NEEDED because this codebase's comments genuinely discuss markup in prose
 * ("<picture> rather than a bare <img> because…") and a naive scan reads that as
 * a real tag with no alt.
 *
 * String and template literals are deliberately LEFT INTACT: the embeddable price
 * widget (app/embed/card/[id]/route.ts) builds its HTML as a template string, and
 * that <img> needs an alt every bit as much as a JSX one. Strings are still
 * *tracked* while scanning, so a "//" inside one can't be mistaken for a comment.
 */
function blankComments(src: string): string {
  const out = src.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      // Skip OVER the literal without blanking it — see the note above.
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") j++;
        j++;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * Find the end of an opening tag, ignoring `>` that appears inside a JSX
 * expression container (`className={a > b ? …}`) or inside a quoted string.
 */
function tagEnd(src: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return j;
  }
  return src.length - 1;
}

for (const file of walk(SRC_DIR).filter((f) => /\.tsx?$/.test(f))) {
  const raw = fs.readFileSync(file, "utf8");
  // `<img` / `<Image` only where it really opens a tag: comments are blanked
  // first, so a sentence like "a plain lazy <img> is used" doesn't count.
  const src = blankComments(raw);
  const re = /<(img|Image)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const end = tagEnd(src, m.index);
    const tag = raw.slice(m.index, end + 1);
    checked++;
    if (!/\balt\s*=/.test(tag)) {
      const line = raw.slice(0, m.index).split("\n").length;
      problems.push(
        `MISSING ALT  ${path.relative(ROOT, file)}:${line} — <${m[1]}> has no alt attribute. ` +
          `Use a descriptive alt (see lib/image-alt.ts cardImageAlt) or alt="" if it is purely decorative.`
      );
    }
  }
}

// ── 3. alt text in article markdown ───────────────────────────────────────────
for (const file of walk(path.join(SRC_DIR, "lib")).filter((f) => /\.tsx?$/.test(f))) {
  const src = fs.readFileSync(file, "utf8");
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    checked++;
    if (!m[1].trim()) {
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(
        `MISSING ALT  ${path.relative(ROOT, file)}:${line} — markdown image ![](${m[2]}) has no alt text.`
      );
    }
  }
}

// ── report ────────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error(`\n\x1b[31mImage guard FAILED — ${problems.length} problem(s):\x1b[0m`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error("");
  process.exit(1);
}
console.log(
  `\x1b[32m[check-images] ${checked} images/tags checked — all under ${MAX_BYTES / 1024}KB and all carry alt.\x1b[0m`
);
