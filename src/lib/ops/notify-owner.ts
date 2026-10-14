// An email to the owner the moment something lands in the inbox, so nobody has to
// remember to look. Called by the five public forms (contact, feedback, wrong-price
// report, store suggestion, support ticket) after the row is saved.
//
// NEVER LETS A NOTIFICATION BREAK A SUBMISSION: it catches everything, and callers
// bound it with a timeout. The submission is already saved; the email is a courtesy.
//
// FLOOD CAP. These forms are public. Resend's free tier is 100 emails a day, shared with
// sign-in, verification and price-alert mail, so a burst of junk submissions must not
// be able to spend it. At most MAX_PER_HOUR / MAX_PER_DAY individual emails go out; past that
// the items still land in the inbox, the admin badge counts them, and the monitor
// mentions how many are waiting. The counters are two Counter rows (hour and day).
import { prisma } from "../db";
import { sendEmail, emailShell, escapeHtml } from "../email";
import { SITE_URL } from "../site";
import { ownerEmail } from "./owner";

export const MAX_PER_HOUR = 8;
export const MAX_PER_DAY = 25;

export type InboxKind = "contact" | "feedback" | "store-suggestion" | "price-report" | "support";

export interface InboxItem {
  kind: InboxKind;
  /** One line: what came in. Goes in the subject. */
  headline: string;
  /** Who sent it, if they said ("Sam <sam@example.com>"). Shown to the owner so they can reply. */
  from?: string | null;
  /** Label/value rows shown above the message. */
  fields?: [string, string | null | undefined][];
  body?: string | null;
}

const LABEL: Record<InboxKind, string> = {
  contact: "Contact message",
  feedback: "Feedback",
  "store-suggestion": "Store suggestion",
  "price-report": "Wrong-price report",
  support: "Support ticket",
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function buildInboxEmail(item: InboxItem): { subject: string; html: string; text: string } {
  const label = LABEL[item.kind];
  const subject = `[RiftCompare inbox] ${label}: ${clip(oneLine(item.headline), 90)}`;
  const rows = (item.fields ?? []).filter(([, v]) => v != null && String(v).trim() !== "") as [string, string][];
  const inner = `
    <tr><td style="padding:8px 32px 4px;font-size:13px;color:#8b95a5">${escapeHtml(label)}${item.from ? ` · from ${escapeHtml(item.from)}` : ""}</td></tr>
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:2px 32px;font-size:14px;color:#b8c0cc"><span style="color:#6b7585">${escapeHtml(k)}:</span> ${escapeHtml(clip(oneLine(v), 300))}</td></tr>`,
      )
      .join("")}
    ${
      item.body
        ? `<tr><td style="padding:10px 32px 6px"><div style="background:#0b0e14;border:1px solid #233047;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.6;color:#e6ebf2;white-space:pre-wrap">${escapeHtml(clip(item.body.trim(), 2000))}</div></td></tr>`
        : ""
    }
    <tr><td style="padding:12px 32px 22px"><a href="${SITE_URL}/admin/messages" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Open the inbox →</a></td></tr>`;
  const text = [
    `${label}${item.from ? ` from ${item.from}` : ""}`,
    ...rows.map(([k, v]) => `${k}: ${clip(oneLine(v), 300)}`),
    item.body ? `\n${clip(item.body.trim(), 2000)}` : "",
    `\nInbox: ${SITE_URL}/admin/messages`,
  ]
    .filter(Boolean)
    .join("\n");
  const footer = `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">Sent to the site owner when something is submitted. Reply to the sender from your own mail.</td></tr>`;
  return { subject, html: emailShell(`New ${escapeHtml(label.toLowerCase())}`, inner, footer, clip(oneLine(item.body ?? item.headline), 120)), text };
}

const pad = (n: number) => String(n).padStart(2, "0");
export function capKeys(now: Date): { hour: string; day: string } {
  const d = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  return { hour: `ops:inbox-mail:h:${d}${pad(now.getUTCHours())}`, day: `ops:inbox-mail:d:${d}` };
}

/** True when this email may go out; counts it. Fails OPEN (sends) if the counters cannot be read. */
async function withinCap(now: Date): Promise<boolean> {
  try {
    const k = capKeys(now);
    const bump = (key: string) => prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
    const [h, dday] = await Promise.all([bump(k.hour), bump(k.day)]);
    return h.value <= MAX_PER_HOUR && dday.value <= MAX_PER_DAY;
  } catch {
    return true;
  }
}

export async function notifyOwnerOfInboxItem(item: InboxItem, now = new Date()): Promise<boolean> {
  try {
    if (!(await withinCap(now))) return false;
    const m = buildInboxEmail(item);
    return await sendEmail(ownerEmail(), m.subject, m.html, { text: m.text });
  } catch {
    return false;
  }
}

/**
 * Await the notification, but never for long: the route's response should not wait on
 * a slow mail provider. Resolves with whatever finished first.
 */
export async function notifyOwnerBounded(item: InboxItem, ms = 4000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([notifyOwnerOfInboxItem(item), new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); })]);
  } catch {
    /* a notification never breaks a submission */
  } finally {
    if (timer) clearTimeout(timer);
  }
}
