import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "./auth-secret";
import { SITE_URL } from "./site";
import { isAdminEmail } from "./admin-emails";
import { isPremium, type EntitlementUser } from "./premium";
import { applyTargetPrice, type TargetDb } from "./target-alerts";
import { clampTargetCents } from "./target-price";
import type { prisma } from "./db";

// ─────────────────────────────────────────────────────────────────────────────
// ONE-TAP ACTIONS FROM A PRICE-ALERT EMAIL (2026-09-25).
// ─────────────────────────────────────────────────────────────────────────────
// Every card row in an alert email carries small signed links:
//   • stop         — stop watching this card (deletes that one PriceAlert row)
//   • snooze       — no email about this card for 30 days (snoozedUntil; every
//                    trigger in lib/price-alerts.ts honours it)
//   • target-set   — Plus/Premium: set the target at the price in the email
//   • target-down  — Plus/Premium: lower the target 10% (value precomputed)
// A free account's row gets a "Set a target with Plus" link instead, and the
// server refuses a target for it anyway (applyTargetPrice → 403).
//
// THE TOKEN. HMAC-SHA256 over "v1.<alertId>.<action>.<value>.<exp>", keyed by
// a key DERIVED from AUTH_SECRET with the label "alert-action:v1" (no new env
// var; a session JWT can never be replayed as an action or the reverse).
// Scoped to one row and one action, carries its own value, and expires after
// 90 days. It is a bearer token — a forwarded email forwards it — so it can do
// only what the row's own email already could: the address's unsubscribe
// token (PriceAlert.unsubToken) can delete every watch outright.
//
// LINK SCANNERS. Mail security scanners and prefetchers GET every link in a
// message. So a GET never changes anything: GET /alerts/action shows a small
// confirmation card, and only its form's POST to /api/alerts/action acts. A
// scanner that GETs cannot act; a human taps once more. The one exception is
// List-Unsubscribe's one-click POST (lib/alert-mute.ts), which only PAUSES —
// reversible, and a POST scanners do not send.
//
// If AUTH_SECRET is rotated, outstanding links stop verifying (403, "link not
// valid"). The footer's pause and manage links still work: they ride the
// row's unsubToken, not this signature.

export const ALERT_ACTIONS = ["stop", "snooze", "target-set", "target-down"] as const;
export type AlertAction = (typeof ALERT_ACTIONS)[number];

/** How long an emailed action link stays valid. */
export const ALERT_ACTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** "Snooze 30 days". */
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
/** "Lower target 10%". */
export const TARGET_DOWN_PCT = 10;

const LABEL = "alert-action:v1";
let derivedKey: Buffer | null = null;
function key(): Buffer {
  if (!derivedKey) derivedKey = createHmac("sha256", Buffer.from(authSecret())).update(LABEL).digest();
  return derivedKey;
}

const b64u = (b: Buffer) => b.toString("base64url");

function mac(payload: string): Buffer {
  return createHmac("sha256", key()).update(payload).digest();
}

export interface AlertActionClaims {
  alertId: string;
  action: AlertAction;
  value: number | null; // target cents for target-set / target-down
  exp: number; // epoch seconds
}

const isAction = (s: string): s is AlertAction => (ALERT_ACTIONS as readonly string[]).includes(s);
const needsValue = (a: AlertAction) => a === "target-set" || a === "target-down";

/** Sign one action for one row. `value` is required for the two target actions. */
export function signAlertAction(opts: { alertId: string; action: AlertAction; value?: number | null; now?: Date }): string {
  const { alertId, action } = opts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(alertId)) throw new Error("alert id not signable");
  const value = needsValue(action) ? clampTargetCents(opts.value ?? 0) : null;
  const exp = Math.floor(((opts.now ?? new Date()).getTime() + ALERT_ACTION_TTL_MS) / 1000);
  const payload = `v1.${alertId}.${action}.${value ?? ""}.${exp}`;
  return `${b64u(Buffer.from(payload))}.${b64u(mac(payload))}`;
}

export type VerifyResult = ({ ok: true } & AlertActionClaims) | { ok: false; reason: "malformed" | "signature" | "expired" };

/** Verify a token: shape, signature (constant-time), then expiry. */
export function verifyAlertAction(token: string | null | undefined, now: Date = new Date()): VerifyResult {
  if (!token || token.length > 400) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return { ok: false, reason: "malformed" };
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payloadPart) || !/^[A-Za-z0-9_-]+$/.test(sigPart)) return { ok: false, reason: "malformed" };
  const payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  const given = Buffer.from(sigPart, "base64url");
  const expected = mac(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, alertId, action, rawValue, rawExp] = parts as [string, string, string, string, string];
  if (!alertId || !isAction(action)) return { ok: false, reason: "malformed" };
  const exp = Number(rawExp);
  if (!Number.isInteger(exp)) return { ok: false, reason: "malformed" };
  const value = rawValue === "" ? null : Number(rawValue);
  if (needsValue(action) ? value == null || !Number.isInteger(value) : value != null) return { ok: false, reason: "malformed" };
  if (exp * 1000 <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, alertId, action, value, exp };
}

/** The confirmation page for one signed action. */
export function alertActionUrl(token: string): string {
  return `${SITE_URL}/alerts/action?t=${encodeURIComponent(token)}`;
}

/** The target a "Lower target 10%" link sets: 10% under the target, or under the price when there is none. */
export function loweredTargetCents(targetCents: number | null, currentCents: number): number {
  return clampTargetCents(Math.floor(((targetCents ?? currentCents) * (100 - TARGET_DOWN_PCT)) / 100));
}

// The links one email row carries. `canTarget` = the row's account is entitled
// (Plus, Premium, admin) — the same check the run makes; the server re-checks
// on POST. A free or anonymous row gets `upsell` instead of the target links.
export interface AlertActionLinks {
  stop: string;
  snooze: string;
  targetSet: { url: string; cents: number } | null;
  targetDown: { url: string; cents: number } | null;
  upsell: string | null;
  // The row's own target when it has one ("Lower target" vs "Set target").
  hasTarget: boolean;
}

export function alertActionLinks(opts: {
  alertId: string;
  currentCents: number;
  targetCents: number | null;
  canTarget: boolean;
  now?: Date;
}): AlertActionLinks {
  const { alertId, currentCents, targetCents, canTarget, now } = opts;
  const url = (action: AlertAction, value?: number) => alertActionUrl(signAlertAction({ alertId, action, value, now }));
  const down = loweredTargetCents(targetCents, currentCents);
  return {
    stop: url("stop"),
    snooze: url("snooze"),
    // "Set target at this price" is pointless when that IS the target already.
    targetSet: canTarget && targetCents !== currentCents ? { url: url("target-set", currentCents), cents: currentCents } : null,
    targetDown: canTarget ? { url: url("target-down", down), cents: down } : null,
    upsell: canTarget ? null : `${SITE_URL}/premium?src=alert-email&utm_source=email&utm_medium=email&utm_campaign=price-alert-target-upsell`,
    hasTarget: targetCents != null,
  };
}

// ── Applying an action (POST /api/alerts/action) ─────────────────────────────

export type AlertActionDb = TargetDb & {
  priceAlert: Pick<typeof prisma.priceAlert, "findUnique" | "deleteMany" | "update">;
};

// The outcome the confirmation page renders (?r=…). "ok" = done.
export type AlertActionOutcome = "ok" | "gone" | "not-plus" | "limit" | "no-account" | "invalid";

export interface AlertActionResult {
  status: number;
  outcome: AlertActionOutcome;
  body: Record<string, unknown>;
}

/**
 * Verify a posted token and apply it. 403 for a bad, tampered or expired
 * token; every other outcome is about the row itself. Target actions go
 * through applyTargetPrice — the same entitlement check (403), Plus limit
 * (409, targetAlertLimit) and re-arm as the watchlist's own PATCH.
 */
export async function performAlertAction(db: AlertActionDb, token: string | null | undefined, now: Date = new Date()): Promise<AlertActionResult> {
  const v = verifyAlertAction(token, now);
  if (!v.ok) return { status: 403, outcome: "invalid", body: { error: "This link is not valid or has expired.", reason: v.reason } };

  const row = await db.priceAlert.findUnique({
    where: { id: v.alertId },
    select: {
      id: true,
      cardId: true,
      market: true,
      userId: true,
      user: { select: { id: true, email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
    },
  });

  if (v.action === "stop") {
    // Idempotent: a second tap (or a row already removed) is still "not watching".
    if (row) await db.priceAlert.deleteMany({ where: { id: row.id } });
    return { status: 200, outcome: "ok", body: { ok: true, action: v.action, removed: row ? 1 : 0 } };
  }
  if (!row) return { status: 404, outcome: "gone", body: { error: "You're no longer watching this card." } };

  if (v.action === "snooze") {
    const until = new Date(now.getTime() + SNOOZE_MS);
    await db.priceAlert.update({ where: { id: row.id }, data: { snoozedUntil: until } });
    return { status: 200, outcome: "ok", body: { ok: true, action: v.action, snoozedUntil: until.toISOString() } };
  }

  // target-set / target-down: an account's watch only, and only while entitled.
  if (!row.userId || !row.user) {
    return { status: 403, outcome: "no-account", body: { error: "Target prices need a Plus account." } };
  }
  const user: EntitlementUser & { id: string } = { ...row.user, id: row.userId, isAdmin: row.user.isAdmin || isAdminEmail(row.user.email) };
  if (!isPremium(user)) return { status: 403, outcome: "not-plus", body: { error: "Target prices are part of Plus." } };
  const res = await applyTargetPrice(db, user, row.cardId, { market: row.market, targetCents: v.value });
  const outcome: AlertActionOutcome =
    res.status === 200 ? "ok" : res.status === 409 ? "limit" : res.status === 403 ? "not-plus" : res.status === 404 ? "gone" : "invalid";
  return { status: res.status, outcome, body: { ...res.body, action: v.action } };
}
