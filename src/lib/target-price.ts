// The "Notify me at $X" input's number rules, shared by the field
// (components/TargetPriceField.tsx) and the PATCH that saves it
// (lib/target-alerts.ts), so what the field accepts is what the route accepts.
// No imports: this ships in the client bundle.

// Whole cents in the watch's own market currency. At least 1 cent; at most
// 100,000.00 — far past any single card, and a guard against a stray zero.
export const MIN_TARGET_CENTS = 1;
export const MAX_TARGET_CENTS = 10_000_000;

// What the person typed → whole cents, or null for "no target". Accepts
// "12", "12.5", "12.50", "$12.50", "A$ 1,200.00", and a decimal comma with no
// point ("12,50" — the EU market); anything without a number in it (including
// an empty field) is null, which clears the target.
export function parseMoneyInput(text: string): number | null {
  let t = text.trim();
  if (!t.includes(".") && /,\d{1,2}$/.test(t)) t = t.replace(/,(\d{1,2})$/, ".$1");
  const cleaned = t.replace(/[^0-9.]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Clamp to the accepted range (the field does this on blur, so a typo becomes
// a visible, valid number rather than a failed save).
export function clampTargetCents(cents: number): number {
  return Math.min(MAX_TARGET_CENTS, Math.max(MIN_TARGET_CENTS, Math.round(cents)));
}

// Cents → the plain number shown in the input ("12.50"), no currency symbol:
// the symbol sits beside the input.
export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
