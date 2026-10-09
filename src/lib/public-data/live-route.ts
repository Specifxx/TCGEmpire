import { withLiveData } from "./mode";

/**
 * Wrap a route handler so its public reads ask Neon first (files only if Neon
 * cannot answer). Every /api/cron route uses it: the alert, release and digest
 * crons run straight after an import and must see that import's prices, not the
 * last release's files. tests/public-data.test.ts pins that none is missing.
 */
export function liveRoute<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  return (...args: A) => withLiveData(() => handler(...args));
}
