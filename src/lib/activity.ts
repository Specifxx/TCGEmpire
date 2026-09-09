// The "last seen" activity throttle — split out from lib/auth.ts, same reason
// lib/signup-source-shared.ts is split from lib/signup-source.ts: auth.ts's
// getCurrentUser() is wrapped in React's cache(), which requires a React
// server-component runtime and cannot be imported into a plain Node test. This
// file has no such dependency, so the throttle itself gets a real unit test.

// Minimum gap between "last seen" writes for the same account — an active
// session touches lastSeenAt at most this often, not on every single page
// render. getCurrentUser() is on the hot path for nearly every route (the root
// layout reads it for the ad-free Premium check), so an unthrottled write here
// would be one extra UPDATE per request for every signed-in visitor.
export const ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60_000;

/** Pure so the throttle can be unit-tested without a database or a clock mock. */
export function shouldTouchLastSeen(lastSeenAt: Date | null, now: Date = new Date()): boolean {
  return !lastSeenAt || now.getTime() - lastSeenAt.getTime() > ACTIVITY_TOUCH_INTERVAL_MS;
}
