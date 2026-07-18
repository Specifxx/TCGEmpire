// Transactional emails for the P2P marketplace order lifecycle. Built on the
// existing Resend `sendEmail` + `emailShell` (lib/email.ts) — same look as every
// other RiftCompare email, just a marketplace-specific footer (no
// newsletter/wishlist unsubscribe language; these are order-status emails).
import { sendEmail, emailShell } from "./email";
import { formatMoney } from "./format";
import { formatOrderNumber } from "./order-number";
import { trackingUrl, CARRIER_LABEL, type Carrier } from "./tracking";
import { SITE_URL } from "./site";
import { MARKETPLACE_SHIP_DEADLINE_DAYS, MARKETPLACE_AUTO_RELEASE_DAYS } from "./marketplace";

function footer(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    Questions about an order? <a href="${SITE_URL}/support" style="color:#9aa4b2;text-decoration:underline">Contact support</a> · RiftCompare Marketplace.
  </td></tr>`;
}

function button(label: string, url: string): string {
  return `<tr><td style="padding:4px 32px 24px"><a href="${url}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${label}</a></td></tr>`;
}

export interface OrderEmailInfo {
  orderId: string;
  orderNumber: number | null;
  cardName: string;
  quantity: number;
  totalCents: number;
  currency: string;
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
export async function sendSaleNotificationEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      You've sold <strong style="color:#fff">${o.quantity} × ${o.cardName}</strong> (order ${num}) for
      ${formatMoney(o.totalCents, o.currency)}. Please ship within <strong style="color:#f2c94c">${MARKETPLACE_SHIP_DEADLINE_DAYS} business days</strong>
      and add tracking — payout is released once the buyer confirms delivery (or automatically
      ${MARKETPLACE_AUTO_RELEASE_DAYS} days after you mark it shipped).
    </td></tr>`;
  return sendEmail(to, `You made a sale — ${num}`, emailShell("You made a sale", inner + button("Mark as shipped", `${SITE_URL}/marketplace/sell`), footer()));
}

// Buyer "it's on the way" — includes the carrier deep-link when we have one.
export async function sendShippedEmail(
  to: string,
  o: OrderEmailInfo,
  carrier: string | null,
  trackingNumber: string | null
): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const url = trackingUrl(carrier, trackingNumber);
  const carrierLabel = carrier ? CARRIER_LABEL[carrier as Carrier] ?? carrier : null;
  const trackLine = trackingNumber
    ? `<div style="margin-top:6px;font-size:14px;color:#b8c0cc">${carrierLabel ?? "Tracking"}: ${
        url ? `<a href="${url}" style="color:#34d17e">${trackingNumber}</a>` : trackingNumber
      }</div>`
    : "";
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Your order <strong style="color:#fff">${num}</strong> (${o.quantity} × ${o.cardName}) has shipped.${trackLine}
    </td></tr>
    <tr><td style="padding:8px 32px 4px;font-size:13px;color:#8b95a5">
      Funds release to the seller once you confirm delivery, or automatically after ${MARKETPLACE_AUTO_RELEASE_DAYS} days.
    </td></tr>`;
  return sendEmail(to, `Shipped — ${num}`, emailShell("Your order has shipped", inner + button("Confirm delivery", `${SITE_URL}/marketplace/orders`), footer()));
}

// Seller "funds released" — sent whether triggered by the buyer confirming or by
// the auto-release cron.
export async function sendFundsReleasedEmail(to: string, o: OrderEmailInfo): Promise<boolean> {
  const num = formatOrderNumber(o.orderNumber) ?? o.orderId;
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      Order <strong style="color:#fff">${num}</strong> is complete — your payout for ${formatMoney(o.totalCents, o.currency)}
      (minus the platform fee) has been sent to your connected Stripe account and follows your normal payout schedule.
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
      within ${MARKETPLACE_SHIP_DEADLINE_DAYS} business days. The listing has been restocked. Please ship promptly to avoid this in future.
    </td></tr>`;
  return sendEmail(to, `Order auto-cancelled — ${num}`, emailShell("Order auto-cancelled", inner + button("View your listings", `${SITE_URL}/marketplace/sell`), footer()));
}
