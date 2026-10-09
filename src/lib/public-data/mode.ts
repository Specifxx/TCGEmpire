// Where public reads go: PUBLIC_DATA_MODE (DECISIONS.md, "Public data moves out
// of Neon into the repository", 2026-10-09).
//
//   db        (default) every read goes to Neon, exactly as before this existed.
//   fallback  Neon first; when Neon cannot answer (unreachable, over its
//             transfer allowance, timing out) public reads are served from the
//             bundled files instead, and keep being for a minute before Neon is
//             tried again. Saves nothing while Neon is healthy; keeps every
//             public page up when it is not.
//   files     public reads come from the bundled files and never touch Neon;
//             Neon serves only private data (accounts, collections, alerts,
//             orders), writes, and the rare query shape the file engine refuses
//             (logged as [public-data:unsupported]).
//
// LIVE SCOPE. A few readers need data fresher than the last release: the alert
// crons, which run right after each import, and the auction board, swept every
// four hours. They run inside withLiveData(), which asks Neon first in every
// mode and falls back to the files only if Neon cannot answer.
import { AsyncLocalStorage } from "node:async_hooks";

export type PublicDataMode = "db" | "fallback" | "files";

export function publicDataMode(): PublicDataMode {
  const v = (process.env.PUBLIC_DATA_MODE || "db").trim().toLowerCase();
  return v === "files" || v === "fallback" ? v : "db";
}

const live = new AsyncLocalStorage<boolean>();

/** Run `fn` with public reads going to Neon first (files only if Neon fails). */
export function withLiveData<T>(fn: () => T): T {
  return live.run(true, fn);
}

export function inLiveScope(): boolean {
  return live.getStore() === true;
}

// ── Neon health ──────────────────────────────────────────────────────────────

const BREAKER_MS = 60_000;
const breaker = globalThis as unknown as { __neonDownUntil?: number };

export function neonMarkedDown(): boolean {
  return (breaker.__neonDownUntil ?? 0) > Date.now();
}

export function markNeonDown(): void {
  breaker.__neonDownUntil = Date.now() + BREAKER_MS;
}

const UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const UNAVAILABLE_TEXT = [
  "data transfer quota",
  "can't reach database server",
  "connection terminated",
  "econnrefused",
  "etimedout",
  "connection refused",
  "too many connections",
  "timed out fetching a new connection",
  "server closed the connection",
];

/** True when an error means "Neon could not answer", not "the query was wrong". */
export function isNeonUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string; errorCode?: string; message?: string };
  if (e.name === "PrismaClientInitializationError" || e.name === "PrismaClientRustPanicError") return true;
  if (e.code && UNAVAILABLE_CODES.has(e.code)) return true;
  if (e.errorCode && UNAVAILABLE_CODES.has(e.errorCode)) return true;
  const msg = (e.message ?? "").toLowerCase();
  return UNAVAILABLE_TEXT.some((t) => msg.includes(t));
}
