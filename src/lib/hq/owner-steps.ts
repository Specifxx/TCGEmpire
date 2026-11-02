// BILL'S WEEKLY QUEUE (owner, 2026-11-02: one weekly batch of Chrome steps, not a
// prompt in every thread). DECISIONS.md, "Empire HQ and the one Monday report".
//
// The queue is data/hq/owner-steps.json on main: a PUBLIC file of titles, reasons
// and the project-files path of each prompt (the prompt text stays private in
// project files). Any Claude thread adds a row by committing to main; HQ reads the
// file from GitHub at request time (with the bundled copy as fallback), so a new
// step shows without a deploy. A step is done when its row has `done`, or when the
// owner presses Done on /admin/hq (one OpsSnapshot row, `hq:steps-done`).
import bundled from "../../../data/hq/owner-steps.json";
import { OWNER_REPO } from "./sites";

export interface OwnerStep {
  id: string;
  site: string;
  kind: "chrome" | "hands";
  title: string;
  why: string;
  added: string;
  /** Path under project files of the full prompt. */
  prompt: string | null;
  done: string | null;
}

export const STEPS_RAW_URL = `https://raw.githubusercontent.com/${OWNER_REPO}/TCGEmpire/main/data/hq/owner-steps.json`;
export const STEPS_DONE_KEY = "hq:steps-done";

const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Parse the queue defensively: a bad row is dropped, never a crash. */
export function parseSteps(j: unknown): OwnerStep[] {
  const steps = (j as { v?: unknown; steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return [];
  const seen = new Set<string>();
  const out: OwnerStep[] = [];
  for (const s of steps as Record<string, unknown>[]) {
    const id = String(s?.id ?? "");
    if (!ID.test(id) || seen.has(id)) continue;
    const title = clip(s.title, 140);
    if (!title) continue;
    seen.add(id);
    out.push({
      id,
      site: clip(s.site, 20) || "all",
      kind: s.kind === "hands" ? "hands" : "chrome",
      title,
      why: clip(s.why, 240),
      added: DAY.test(String(s.added)) ? String(s.added) : "",
      prompt: typeof s.prompt === "string" && /^[\w./-]+\.md$/.test(s.prompt) && !s.prompt.includes("..") ? s.prompt : null,
      done: DAY.test(String(s.done ?? "")) ? String(s.done) : null,
    });
  }
  return out;
}

export type DoneMap = Record<string, string>;

export function parseDone(j: unknown): DoneMap {
  const m = (j as { done?: unknown } | null)?.done;
  if (!m || typeof m !== "object") return {};
  const out: DoneMap = {};
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) if (ID.test(k) && typeof v === "string") out[k] = v;
  return out;
}

export interface StepView extends OwnerStep {
  /** When it was done (the file's day or the owner's press), or null when open. */
  doneAt: string | null;
}

/** Open steps first (oldest first: the longest waiting leads), then the last few done. */
export function stepViews(steps: readonly OwnerStep[], done: DoneMap): StepView[] {
  const v = steps.map((s) => ({ ...s, doneAt: s.done ?? done[s.id] ?? null }));
  const open = v.filter((s) => !s.doneAt).sort((a, b) => a.added.localeCompare(b.added));
  const closed = v.filter((s) => s.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!));
  return [...open, ...closed.slice(0, 8)];
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The queue as GitHub has it now, or the copy bundled with this release. */
export async function loadSteps(f: Fetch = fetch): Promise<OwnerStep[]> {
  try {
    const res = await f(STEPS_RAW_URL, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const steps = parseSteps(await res.json());
      if (steps.length) return steps;
    }
  } catch {
    // fall through to the bundled copy
  }
  return parseSteps(bundled);
}
