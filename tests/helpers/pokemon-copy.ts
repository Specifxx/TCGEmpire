// The Pokémon copy scanner, shared by tests/pokemon-copy.test.ts and any
// Pokémon test that checks generated strings (the blog, the share cards,
// copy buttons). A helper, not a test file: importing a *.test.ts would run
// its tests a second time.

import ts from "typescript";

export const BANNED: { re: RegExp; why: string }[] = [
  { re: /\bworth\b/i, why: "no value judgement (\"worth\")" },
  { re: /\binvest\w*/i, why: "no investment language" },
  { re: /\bwill (?:rise|go up|increase|climb)\b/i, why: "no prediction" },
  { re: /\breal[- ]?time\b/i, why: "updated daily, never real-time" },
  { re: /\blive prices?\b/i, why: "updated daily, never live" },
  { re: /\bsold listings?\b|\bcompleted sales?\b|\brecent sales?\b|\bsold prices?\b/i, why: "listings, never sales" },
  { re: /\b(?:best|great|good) value\b/i, why: "say \"lowest price per pack\"" },
  { re: /\bdeals?\b/i, why: "say \"lowest price per pack\" / \"cheapest listing\"" },
  { re: /\bbargains?\b|\bundervalued\b|\bsteals?\b/i, why: "no value judgement" },
  { re: /\bfive markets\b/i, why: "six markets; name eBay's markets instead" },
  { re: /\bshipping included\b|\bfree shipping\b/i, why: "item price, postage extra" },
  { re: /\btwice a day\b|\bhourly\b|\bevery hour\b/i, why: "updated daily" },
  { re: /\bMSRP\b|\bRRP\b/i, why: "no MSRP until a sourced registry exists" },
  { re: /\b(?:pull|hit) rates?\b/i, why: "we hold no pull-rate data" },
];

/** Exact fragments that carry a banned word in an honest, negating sentence. */
const ALLOW = ["Nothing here is real-time"];

/** Every piece of text a file could render: string literals, template text, JSX text. */
export function renderableText(source: string, fileName = "x.tsx"): { text: string; line: number }[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node) => {
    // Module specifiers are paths, not copy.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text) out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function copyViolations(source: string, fileName: string): string[] {
  const found: string[] = [];
  for (const { text, line } of renderableText(source, fileName)) {
    let t = text;
    for (const a of ALLOW) t = t.split(a).join(" ");
    for (const b of BANNED) if (b.re.test(t)) found.push(`${fileName}:${line} "${text.slice(0, 90)}" — ${b.why}`);
  }
  return found;
}

/** The bans applied to one generated string (a block's markdown, a bot reply, copied text). */
export function textViolations(text: string): string[] {
  let t = text;
  for (const a of ALLOW) t = t.split(a).join(" ");
  return BANNED.filter((b) => b.re.test(t)).map((b) => b.why);
}
