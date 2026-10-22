// Radiance as it was flagged BEFORE release (comingSoon, newFrom 12 Oct, no
// recentlyReleased), for the tests that pin how the pre-release machinery
// behaves at a pre-release `now`. Not a test file itself (npm test globs
// tests/*.test.ts).
//
// Why it exists: on 2026-10-22 (owner: "Radiance is out now ... nothing is
// coming soon anymore") RAD lost `comingSoon`/`newFrom` in lib/constants.ts.
// The date rules those flags feed (isPreorderSetCode, nextUpcomingSet,
// showsAsNew…) are unchanged and are still what the next set will run on, so
// their tests keep exercising them against the real RAD row, re-flagged for
// the duration of one callback and restored afterwards (even on a throw).
import { setByCode, type SetInfo } from "../../src/lib/constants";

export function withRadianceUpcoming<T>(fn: () => T): T {
  const rad = setByCode("RAD") as SetInfo;
  const saved = { ...rad };
  rad.comingSoon = true;
  rad.newFrom = "2026-10-12";
  delete rad.recentlyReleased;
  const restore = () => {
    for (const k of Object.keys(rad) as (keyof SetInfo)[]) delete rad[k];
    Object.assign(rad, saved);
  };
  let out: T;
  try {
    out = fn();
  } catch (e) {
    restore();
    throw e;
  }
  // An async callback keeps the flags until its promise settles.
  if (out && typeof (out as { then?: unknown }).then === "function") {
    return (out as unknown as Promise<unknown>).finally(restore) as unknown as T;
  }
  restore();
  return out;
}
