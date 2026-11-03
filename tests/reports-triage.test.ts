// The daily visitor-report triage (scripts/reports-triage.mjs): reads each site's
// own `reports` branch, flags what needs a look, and never quotes a note in the
// public issue it writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSite, issueBody, flag, SITE_REPOS } from "../scripts/reports-triage.mjs";

const report = (o: Record<string, unknown>) => ({ v: 1, at: "2026-10-30T01:00:00Z", site: "riftcompare", kind: "wrong-price", page: "/card/x", product: "Jinx", store: "Shop", note: "secret words", ...o });

test("loadSite reads inbox/<site>/ on the site's reports branch only", async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (url: string) => {
    seen.push(url);
    if (url.includes("/git/trees/reports")) {
      return Response.json({ tree: [
        { type: "blob", path: "inbox/riftcompare/2026-10-30/010000-wrong-price-a.json", sha: "a" },
        { type: "blob", path: "done/riftcompare/2026-10-29/010000-wrong-price-b.json", sha: "b" },
        { type: "blob", path: "README.md", sha: "c" },
      ] });
    }
    return Response.json({ content: Buffer.from(JSON.stringify(report({}))).toString("base64") });
  }) as typeof fetch;
  try {
    const r = (await loadSite("riftcompare"))!;
    assert.equal(r.length, 1);
    assert.equal(r[0].url, "https://github.com/Specifxx/TCGEmpire/blob/reports/inbox/riftcompare/2026-10-30/010000-wrong-price-a.json");
    assert.ok(seen.every((u) => u.includes("/repos/Specifxx/TCGEmpire/")));
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;
    assert.equal(await loadSite("riftcompare"), null, "a missing branch is reported, not read as empty");
  } finally {
    globalThis.fetch = real;
  }
});

test("repeat wrong prices are flagged first and notes are never quoted", () => {
  const rs = [report({ url: "u1" }), report({ url: "u2" }), report({ kind: "suggest-store", store: "New", url: "u3" })];
  const f = flag(rs, Date.parse("2026-10-31T00:00:00Z"));
  assert.equal(f[0].kind, "wrong-price");
  assert.match(f[0].why.join(), /reported 2 times/);
  const body = issueBody("riftcompare", rs);
  assert.ok(!body.includes("secret words"), "public issue: link the file, never quote the note");
  assert.match(body, /\[report\]\(u1\)/);
});

test("the triage knows the same twelve repos as the writer", () => {
  const src = readFileSync("src/lib/reports-github.ts", "utf8");
  for (const [site, repo] of Object.entries(SITE_REPOS as Record<string, string>)) assert.ok(src.includes(`${site}: "${repo}"`), site);
  assert.equal(Object.keys(SITE_REPOS).length, 12);
});
