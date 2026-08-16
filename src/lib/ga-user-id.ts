import { createHash } from "node:crypto";

// GA4 User-ID: a stable, opaque identifier for a signed-in account.
// https://support.google.com/analytics/answer/9213390
//
// WHY THIS IS A HASH AND NOT THE USER'S ROW ID.
// Google requires the value be non-PII, unique and persistent. The internal cuid
// already satisfies all three, so hashing is not needed to meet the rule — it is
// here because of a boundary this codebase already keeps: `User.id` is server-
// side only. It appears in no client payload (see /api/me, and MenuUser, which
// has no id field), and every use of it lives in a route handler. Sending it to
// gtag would newly publish the database primary key into client JS and into
// Google's systems, where anyone with read access to the GA reports would be
// holding working record keys. Hashing keeps that boundary intact while giving
// GA a value that is just as stable and just as unique.
//
// This is NOT a security control — it is scope reduction. With the fallback salt
// below the digest is reproducible by anyone reading this file; set
// GA_USER_ID_SALT to make it reproducible only by someone who also has the
// environment.
//
// ── THE SALT MUST NEVER CHANGE ONCE TRAFFIC IS FLOWING ──────────────────────
// user_id is the join key for every cross-device and returning-user report in
// the property. Change the salt and every account silently becomes a brand-new
// user: returning-user counts collapse, cohorts break, and no error is raised
// anywhere because each individual hash is still perfectly valid. Treat it like
// a primary key, not like a secret to be rotated. If it ever must change, expect
// a one-off discontinuity in user-scoped reporting on that date.
const FALLBACK_SALT = "riftcompare.ga4.user-id.v1";

const SALT = process.env.GA_USER_ID_SALT || FALLBACK_SALT;

/**
 * Opaque, stable GA4 `user_id` for an account. Same input always yields the same
 * output, and the digest cannot be reversed to the account's row id.
 *
 * Server-only — imports node:crypto. Compute it in a route handler and send the
 * result to the client; never import this into a client component.
 */
export function analyticsUserId(userId: string): string {
  // 32 hex chars (128 bits) — far below GA4's 256-character limit, and wide
  // enough that a collision across any realistic number of accounts is not a
  // practical concern.
  return createHash("sha256").update(`${SALT}:${userId}`).digest("hex").slice(0, 32);
}
