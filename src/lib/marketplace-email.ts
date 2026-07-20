// Transactional emails for the P2P marketplace order lifecycle. Built on the
// existing Resend `sendEmail` + `emailShell` (lib/email.ts) — same look as every
// other RiftCompare email, just a marketplace-specific footer (no
// newsletter/wishlist unsubscribe language; these are order-status emails).
import { sendEmail, emailShell } from "./email";
import { formatMoney } from "./format";
import { formatOrderNumber } from "./order-number";
import { trackingUrl, CARRIER_LABEL, type Carrier } from "./tracking";
import { SITE_URL, SUPPORT_EMAIL } from "./site";
import { MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_AUTO_RELEASE_DAYS } from "./marketplace";
import { formatDay, formatDateRange, type DeliveryWindow } from "./delivery-estimate";

function footer(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    Questions about an order? <a href="${SITE_URL}/support" style="color:#9aa4b2;text-decoration:underline">Contact support</a> · RiftCompare Marketplace.
  </td></tr>`;
}

function button(label: string, url: string): string {
  return `<tr><td style="padding:4px 32px 24px"><a href="${url}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${label}</a></td></tr>`;
}

// Free-text (a chat message, unlike every other field in this file) — must be
// escaped before landing in an HTML email.
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface OrderEmailInfo {
  orderId: string;
  orderNumber: number | null;
  cardName: string;
  quantity: number;
  totalCents: number;
  currency: string;
  // Only populated (and only used) by the seller-facing sale/payout emails —
  // every other email builds an OrderEmailInfo without it.
  feeCents?: number;
}

// Buyer receipt — sent when the webhook flips the order to PAID.
export async function sendOrderReceiptEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> is confirmed — the seller has been notified and will ship soon.
    </td></tr>
    <tr><td style="padding:12px 32px 4px;font-size:15px;color:#fff">${o.quantity} × ${o.cardName}</td></tr>
    <tr><td style="padding:2px 32px 16px;font-size:14px;color:#8b95a5">Total paid: ${formatMoney(o.totalCents, o.currency)}</td></tr>`;
  return sendEmail(to, `Order confirmed — ${num}`, emailShell("Order confirmed", inner + button("Track your order", `${SITE_URL}/marketplace/orders`), footer()));
}

// Seller "you made a sale" — sent alongside the buyer receipt.
export async function sendSaleNotificationEmail(to: string, o: OrderEmailInfo, shipBy: Date): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const fee = o.feeCents ?? 0;
  const net = o.totalCents - fee;
  const feeLine = fee > 0
    ? `<tr><td style="padding:0 32px 4px;font-size:13px;color:#8b95a5">
        Sale price ${formatMoney(o.totalCents, o.currency)} − ${formatMoney(fee, o.currency)} RiftCompare fee (5%) =
        <strong style="color:#34d17e">${formatMoney(net, o.currency)}</strong> you'll receive.
      </td></tr>`
    : "";
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You've sold <strong style="color:#fff">${o.quantity} × ${o.cardName}</strong> (order ${num}) for
      ${formatMoney(o.totalCents, o.currency)}. Please ship by <strong style="color:#f2c94c">${formatDay(shipBy)}</strong>
      and add tracking — after that the order auto-refunds.
    </td></tr>
    ${feeLine}
    <tr><td style="padding:0 32px 4px;font-size:13px;color:#8b95a5">
      Payout is released once the buyer confirms delivery (or automatically ${MARKETPLACE_AUTO_RELEASE_DAYS} days after
      you mark it shipped).
    </td></tr>`;
  return sendEmail(to, `You made a sale — ${num}`, emailShell("You made a sale", inner + button("Mark as shipped", `${SITE_URL}/marketplace/sell`), footer()));
}

// Buyer "it's on the way" — includes the carrier deep-link when we have one.
export async function sendShippedEmail(
  to: string,
  o: OrderEmailInfo,
  carrier: string | null,
  trackingNumber: string | null,
  eta: DeliveryWindow | null,
  autoReleaseAt: Date
): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const url = trackingUrl(carrier, trackingNumber);
  const carrierLabel = carrier ? CARRIER_LABEL[carrier as Carrier] ?? carrier : null;
  const trackLine = trackingNumber
    ? `<div style="margin-top:6px;font-size:14px;color:#b8c0cc">${carrierLabel ?? "Tracking"}: ${
        url ? `<a href="${url}" style="color:#34d17e">${trackingNumber}</a>` : trackingNumber
      }</div>`
    : "";
  const etaLine = eta
    ? `<tr><td style="padding:0 32px 4px;font-size:14px;color:#b8c0cc">Estimated delivery: <strong style="color:#fff">${formatDateRange(eta.from, eta.to)}</strong> (estimate)</td></tr>`
    : "";
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your order <strong style="color:#fff">${num}</strong> (${o.quantity} × ${o.cardName}) has shipped.${trackLine}
    </td></tr>
    ${etaLine}
    <tr><td style="padding:8px 32px 4px;font-size:13px;color:#8b95a5">
      Funds release to the seller automatically on <strong style="color:#f2c94c">${formatDay(autoReleaseAt)}</strong> — sooner if you
      confirm delivery, and paused if you report a problem.
    </td></tr>`;
  return sendEmail(to, `Shipped — ${num}`, emailShell("Your order has shipped", inner + button("Confirm delivery", `${SITE_URL}/marketplace/orders`), footer()));
}

// Seller "funds released" — sent whether triggered by the buyer confirming or by
// the auto-release cron.
export async function sendFundsReleasedEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const fee = o.feeCents ?? 0;
  const net = o.totalCents - fee;
  const breakdown = fee > 0
    ? `${formatMoney(o.totalCents, o.currency)} sale − ${formatMoney(fee, o.currency)} fee (5%) = <strong style="color:#fff">${formatMoney(net, o.currency)}</strong>`
    : formatMoney(net, o.currency);
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> is complete — your payout of ${breakdown} has been sent to your
      connected Stripe account and follows your normal payout schedule.
    </td></tr>`;
  return sendEmail(to, `Funds released — ${num}`, emailShell("Funds released", inner + button("View your funds", `${SITE_URL}/marketplace/funds`), footer()));
}

// Buyer + seller "order cancelled and refunded" — the seller missed the ship
// deadline, so the cron refunded the buyer in full.
export async function sendAutoCancelledBuyerEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> (${o.quantity} × ${o.cardName}) was cancelled because the seller didn't ship
      in time. You've been refunded ${formatMoney(o.totalCents, o.currency)} in full — no action needed.
    </td></tr>`;
  return sendEmail(to, `Order cancelled and refunded — ${num}`, emailShell("Order cancelled", inner + button("Browse the marketplace", `${SITE_URL}/marketplace`), footer()));
}

export async function sendAutoCancelledSellerEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> was automatically cancelled and refunded because it wasn't marked shipped
      within ${MARKETPLACE_SHIP_DEADLINE_DAYS} days. The listing has been restocked. Please ship promptly to avoid this in future.
    </td></tr>`;
  return sendEmail(to, `Order auto-cancelled — ${num}`, emailShell("Order auto-cancelled", inner + button("View your listings", `${SITE_URL}/marketplace/sell`), footer()));
}

// Internal notification to the support inbox — every order auto-releases on its
// own schedule regardless, so this is purely an EARLY-release request: the
// seller believes tracking shows it delivered and wants it sooner than the
// scheduled date. Never releases anything itself; just surfaces it in the
// admin exception queue.
export async function sendReleaseRequestedEmail(o: OrderEmailInfo, scheduledReleaseAt: Date): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      The seller on order <strong style="color:#fff">${num}</strong> (${o.quantity} × ${o.cardName}, ${formatMoney(o.totalCents, o.currency)})
      has requested an early release — they believe tracking shows it delivered. It's already scheduled to auto-release on
      ${formatDay(scheduledReleaseAt)}; check the tracking link and release now, or leave it to auto-release.
    </td></tr>`;
  return sendEmail(SUPPORT_EMAIL, `[RC] Early release requested — ${num}`, emailShell("Early release requested", inner + button("Review in admin →", `${SITE_URL}/admin/marketplace`), footer()));
}

// Buyer "order complete" + review prompt — fires on BOTH release paths (manual
// confirm and the 14-day auto-release), since previously neither told the buyer
// anything and no review nudge existed at all.
export async function sendOrderCompletedBuyerEmail(to: string, o: OrderEmailInfo, opts: { auto: boolean }): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const body = opts.auto
    ? `Order <strong style="color:#fff">${num}</strong> auto-completed ${MARKETPLACE_AUTO_RELEASE_DAYS} days after it shipped, and the seller has been paid. If something's wrong, contact support.`
    : `Thanks for confirming delivery on order <strong style="color:#fff">${num}</strong> — the seller has been paid.`;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">${body}</td></tr>`;
  return sendEmail(to, `Order complete — ${num}`, emailShell("Order complete", inner + button("★ Review your seller", `${SITE_URL}/marketplace/orders`), footer()));
}

// Seller "ship soon" reminder — sent ~24h before the auto-refund deadline for
// orders still unshipped, so a seller isn't blindsided by the auto-cancel cron.
export async function sendShipReminderEmail(to: string, o: OrderEmailInfo, shipBy: Date): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> (${o.quantity} × ${o.cardName}) must ship by
      <strong style="color:#f2c94c">${formatDay(shipBy)}</strong> — that's within 24 hours. If it isn't marked shipped by
      then, it's automatically cancelled and the buyer refunded in full.
    </td></tr>`;
  return sendEmail(to, `Ship soon — ${num} due ${formatDay(shipBy)}`, emailShell("Ship reminder", inner + button("Mark as shipped", `${SITE_URL}/marketplace/sell`), footer()));
}

// Buyer "has it arrived?" nudge — sent once the estimated delivery window has
// passed for a shipped order that's neither been confirmed nor disputed.
export async function sendDeliveryNudgeEmail(to: string, o: OrderEmailInfo, etaLabel: string, autoReleaseAt: Date): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> should have arrived by now (estimated ${etaLabel}). Tap "Confirm
      delivery" once it's landed — or "Report a problem" if something's wrong. If you do nothing, it auto-completes on
      <strong style="color:#fff">${formatDay(autoReleaseAt)}</strong>.
    </td></tr>`;
  return sendEmail(to, `Has your order arrived? — ${num}`, emailShell("Has it arrived?", inner + button("Confirm delivery", `${SITE_URL}/marketplace/orders`), footer()));
}

// ─── Mutual-agreement cancellation ──────────────────────────────────────────

// To whichever party DIDN'T propose the cancellation — asks them to accept or
// decline in My Orders. Nothing is cancelled/refunded until they respond.
export async function sendCancelRequestedEmail(to: string, o: OrderEmailInfo, requestedByName: string, reason: string): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <strong style="color:#fff">${requestedByName}</strong> wants to cancel order <strong style="color:#fff">${num}</strong>
      (${o.quantity} × ${o.cardName}) and issue a full refund.
    </td></tr>
    <tr><td style="padding:4px 32px 16px;font-size:14px;color:#b8c0cc;font-style:italic">"${reason}"</td></tr>
    <tr><td style="padding:0 32px 16px;font-size:13px;color:#8b95a5">Nothing happens until you accept or decline — do that from My orders.</td></tr>`;
  return sendEmail(to, `Cancellation requested — ${num}`, emailShell("Cancellation requested", inner + button("Review in My orders", `${SITE_URL}/marketplace/orders`), footer()));
}

// To both buyer and seller once the cancellation is accepted and refunded.
export async function sendCancelledMutualEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> (${o.quantity} × ${o.cardName}) has been cancelled by mutual
      agreement. The buyer has been refunded ${formatMoney(o.totalCents, o.currency)} in full.
    </td></tr>`;
  return sendEmail(to, `Order cancelled — ${num}`, emailShell("Order cancelled", inner + button("View orders", `${SITE_URL}/marketplace/orders`), footer()));
}

// To whoever proposed the cancellation, if the other party declines.
export async function sendCancelDeclinedEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your request to cancel order <strong style="color:#fff">${num}</strong> was declined — the order continues as
      normal. If something's still wrong, use "Report a problem" on the order to get an admin involved.
    </td></tr>`;
  return sendEmail(to, `Cancellation declined — ${num}`, emailShell("Cancellation declined", inner + button("View order", `${SITE_URL}/marketplace/orders`), footer()));
}

// ─── Buyer/seller messaging ──────────────────────────────────────────────────

// New message on an order thread — sent to whichever party didn't send it, so
// a message always reaches them even if they aren't watching the bell.
export async function sendNewMessageEmail(to: string, o: OrderEmailInfo, fromName: string, body: string): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const preview = body.length > 300 ? `${body.slice(0, 300)}…` : body;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      <strong style="color:#fff">${escHtml(fromName)}</strong> sent you a message about order <strong style="color:#fff">${num}</strong>
      (${o.quantity} × ${escHtml(o.cardName)}):
    </td></tr>
    <tr><td style="padding:4px 32px 16px;font-size:14px;color:#e2e6ec;font-style:italic;white-space:pre-wrap">"${escHtml(preview)}"</td></tr>`;
  return sendEmail(to, `New message from ${fromName} — ${num}`, emailShell("New message", inner + button("Reply in My orders", `${SITE_URL}/marketplace/orders`), footer()));
}
