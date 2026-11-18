// Which set, if any, is in its reveal season today: from REVEAL_LEAD_DAYS before its
// street date to REVEAL_TAIL_DAYS after it. Prints the set's slug, or nothing.
// set-reveals.yml runs the official-gallery pipeline only when this prints a slug,
// so new cards get pages as Riot reveals them, without anyone dispatching a task
// (owner, 2026-11-18: "new sets and preorders first ... a missing card page won't rank").
import { SETS, streetDateStartMs } from "../src/lib/constants";

export const REVEAL_LEAD_DAYS = 60;
export const REVEAL_TAIL_DAYS = 21;
const DAY = 86_400_000;

export function setInRevealSeason(now = Date.now()): string | null {
  const live = SETS.filter((s) => s.releasedOn)
    .map((s) => ({ s, at: streetDateStartMs(s.releasedOn!) }))
    .filter(({ at }) => Number.isFinite(at) && now >= at - REVEAL_LEAD_DAYS * DAY && now <= at + REVEAL_TAIL_DAYS * DAY)
    .sort((a, b) => a.at - b.at);
  return live[0]?.s.slug ?? null;
}

if (process.argv[1]?.endsWith("set-reveal-window.ts")) {
  const at = process.env.AT ? Date.parse(process.env.AT) : Date.now();
  process.stdout.write(process.env.SET || setInRevealSeason(at) || "");
}
