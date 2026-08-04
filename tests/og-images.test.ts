import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// ─────────────────────────────────────────────────────────────────────────────
// Satori (the renderer behind next/og) has one rule that ordinary React does not:
//
//   "Expected <div> to have explicit display: flex or display: none if it has
//    more than one child node."
//
// It is enforced at RENDER time, so it doesn't fail typecheck, doesn't fail lint,
// and doesn't fail any test that only reads the file as text — it fails
// `next build` while prerendering, i.e. in production. It bit /decks exactly
// once: `<div>Tier {d.tier} · {d.archetype}</div>` looks like one line of text
// but compiles to four children.
//
// This walks the real TS AST of every opengraph-image/twitter-image module and
// applies the rule statically, so the failure surfaces in `npm test` instead.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(process.cwd(), "src");

function ogModules(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) ogModules(p, out);
    else if (/^(opengraph|twitter)-image\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** Children that Satori actually counts: real elements, non-blank text, and
 *  expression containers — but NOT `{/* comments *\/}`, which carry no expression. */
function meaningfulChildren(node: ts.JsxElement | ts.JsxFragment): number {
  return node.children.filter((c) => {
    if (ts.isJsxText(c)) return /\S/.test(c.text);
    if (ts.isJsxExpression(c)) return c.expression !== undefined;
    return ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c);
  }).length;
}

/** "flex" | "none" | null when the style object literally sets display, or
 *  "unknown" when the style isn't a plain object literal we can read. */
function displayOf(open: ts.JsxOpeningElement): "flex" | "none" | "other" | "unknown" | null {
  const attr = open.attributes.properties.find(
    (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === "style"
  );
  if (!attr?.initializer) return null;
  if (!ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) return "unknown";
  const obj = attr.initializer.expression;
  if (!ts.isObjectLiteralExpression(obj)) return "unknown";
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText().replace(/["']/g, "");
    if (key !== "display") continue;
    const v = prop.initializer;
    if (!ts.isStringLiteral(v)) return "unknown";
    return v.text === "flex" ? "flex" : v.text === "none" ? "none" : "other";
  }
  return null;
}

const FILES = ogModules(ROOT);

test("there is at least one OG image module to check", () => {
  assert.ok(FILES.length > 0, "expected opengraph-image modules under src/");
});

for (const file of FILES) {
  const rel = file.slice(process.cwd().length + 1);

  test(`${rel}: every multi-child <div> declares display`, () => {
    const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const violations: string[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isJsxElement(node)) {
        const tag = node.openingElement.tagName.getText();
        // Satori's message names <div>; restrict to it rather than guessing at
        // how it lays out other intrinsics.
        if (tag === "div" && meaningfulChildren(node) > 1) {
          const d = displayOf(node.openingElement);
          if (d !== "flex" && d !== "none" && d !== "unknown") {
            const { line } = src.getLineAndCharacterOfPosition(node.getStart());
            violations.push(
              `  line ${line + 1}: <div> has ${meaningfulChildren(node)} children but display is ${d ?? "unset"}`
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);

    assert.equal(
      violations.length,
      0,
      `Satori will throw at build time:\n${violations.join("\n")}\n` +
        `Fix by adding display:"flex" to the style, or by collapsing the children into one ` +
        `template literal (e.g. {\`Tier \${a} · \${b}\`} rather than Tier {a} · {b}).`
    );
  });

  test(`${rel}: exports the metadata next/og requires`, () => {
    const text = readFileSync(file, "utf8");
    assert.match(text, /export const size\s*=/, "must export size");
    assert.match(text, /export const contentType\s*=/, "must export contentType");
    assert.match(text, /export const alt\s*=/, "must export alt for accessibility");
  });
}
