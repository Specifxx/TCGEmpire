/**
 * QA guard: which sites have shipped a new build since the last walk (DECISIONS.md, 2026-11-26).
 *
 *   npx tsx scripts/qa-guard/changed.ts qa-state.json   → prints comma-separated site keys, updates the file
 *
 * Every site releases at its own hour, so the hourly run asks each home page for its Next.js build id
 * (one plain GET, no browser) and walks only the sites whose id changed: every release is checked
 * within the hour of going live. `QA_ALL=1` (the daily full walk) prints every site.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { SITES } from "./sites";
import { USER_AGENT_DESKTOP } from "./journeys";

export function buildId(html: string): string | null {
  const pages = html.match(/"buildId":"([^"]+)"/)?.[1] ?? html.match(/\/_next\/static\/([A-Za-z0-9_-]{6,})\/_(?:buildManifest|ssgManifest)\.js/)?.[1];
  if (pages) return pages;
  // App router pages carry no buildId; their chunk names change with every build.
  const chunks = (html.match(/\/_next\/static\/chunks\/[^"' ]*?-[0-9a-f]{12,}\.js/g) ?? []).slice(0, 8).join(",");
  return chunks || null;
}

async function main() {
  const file = process.argv[2] ?? "qa-state.json";
  const state: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const changed: string[] = [];
  for (const s of SITES) {
    try {
      const r = await fetch(s.url + "/", { headers: { "user-agent": USER_AGENT_DESKTOP }, signal: AbortSignal.timeout(20_000) });
      const id = buildId(await r.text());
      if (!id) {
        changed.push(s.key); // unreadable: walk it, the walk says what is wrong
        continue;
      }
      if (state[s.key] !== id) changed.push(s.key);
      state[s.key] = id;
    } catch {
      changed.push(s.key);
    }
  }
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log((process.env.QA_ALL === "1" ? SITES.map((s) => s.key) : changed).join(","));
}

// Run only as a script, so tests can import buildId.
if (/qa-guard[\\/]changed\.ts$/.test(process.argv[1] ?? "")) main();
