import { CONTACT_EMAIL } from "../site";

// Who the ops monitor and the instant inbox emails go to. The owner asked for this
// address explicitly (2026-10-14: "email it to bill.jyang101@gmail.com"); an
// OWNER_ALERT_EMAIL setting overrides it without a code change. The recipient is
// always chosen on the server, never taken from a request.
export const DEFAULT_OWNER_EMAIL = "bill.jyang101@gmail.com";

export function ownerEmail(env: Record<string, string | undefined> = process.env): string {
  const v = (env.OWNER_ALERT_EMAIL ?? "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v : DEFAULT_OWNER_EMAIL;
}

// Where a visitor's message goes (contact, wrong-price report, store suggestion, support,
// written feedback): the site's own inbox, the address /contact shows, so a reply comes
// from RiftCompare and every site's mail lands in that site's mailbox (owner, 2026-10-30:
// "any feedback feeds into the respective emails"). Ops alerts stay with ownerEmail().
// INBOX_EMAIL overrides it; never taken from a request.
export function inboxEmail(env: Record<string, string | undefined> = process.env): string {
  const v = (env.INBOX_EMAIL ?? "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v : CONTACT_EMAIL;
}

// The weekly growth report (lib/earnings/growth-report.ts) goes to the business inbox
// the growth review reads, not the owner's personal one (2026-10-30). GROWTH_REPORT_EMAIL
// overrides it; like ownerEmail, the recipient is never taken from a request.
export const DEFAULT_GROWTH_REPORT_EMAIL = "riftcompare@gmail.com";

export function growthReportEmail(env: Record<string, string | undefined> = process.env): string {
  const v = (env.GROWTH_REPORT_EMAIL ?? "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v : DEFAULT_GROWTH_REPORT_EMAIL;
}
