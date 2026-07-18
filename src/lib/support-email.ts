// Support ticket emails — one to SUPPORT_EMAIL (Riftcompare@gmail.com) so the team
// sees it land in their normal inbox, one confirmation back to the submitter with
// their ticket number so they have a reference to reply to.
import { sendEmail, emailShell } from "./email";
import { SUPPORT_EMAIL, SITE_URL } from "./site";

function footer(): string {
  return `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">RiftCompare Support</td></tr>`;
}

export interface SupportTicketInfo {
  number: number;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  orderId: string | null;
}

// Internal notification to the support inbox — includes everything needed to act
// without opening the admin panel, plus a link to it for status changes.
export async function sendSupportTicketNotification(t: SupportTicketInfo): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:14px;color:#b8c0cc">
      <strong style="color:#fff">RC-${t.number}</strong> · ${t.category}${t.orderId ? ` · order ${t.orderId}` : ""}
    </td></tr>
    <tr><td style="padding:4px 32px 4px;font-size:14px;color:#fff">From: ${t.name} &lt;${t.email}&gt;</td></tr>
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc;white-space:pre-wrap">${escapeHtml(t.message)}</td></tr>
    <tr><td style="padding:4px 32px 24px"><a href="${SITE_URL}/admin/support" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">Open in admin →</a></td></tr>`;
  return sendEmail(SUPPORT_EMAIL, `[RC-${t.number}] ${t.subject}`, emailShell("New support ticket", inner, footer()));
}

// Confirmation back to the submitter — sets expectations and gives them the
// ticket number to reference if they follow up.
export async function sendSupportTicketConfirmation(t: SupportTicketInfo): Promise<boolean> {
  const inner = `
    <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">
      We've received your message (ticket <strong style="color:#fff">RC-${t.number}</strong>) and will reply by email —
      usually within a day or two.
    </td></tr>`;
  return sendEmail(t.email, `We got your message — RC-${t.number}`, emailShell("Ticket received", inner, footer()));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
