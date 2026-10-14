// Who the ops monitor and the instant inbox emails go to. The owner asked for this
// address explicitly (2026-10-14: "email it to bill.jyang101@gmail.com"); an
// OWNER_ALERT_EMAIL setting overrides it without a code change. The recipient is
// always chosen on the server, never taken from a request.
export const DEFAULT_OWNER_EMAIL = "bill.jyang101@gmail.com";

export function ownerEmail(env: Record<string, string | undefined> = process.env): string {
  const v = (env.OWNER_ALERT_EMAIL ?? "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? v : DEFAULT_OWNER_EMAIL;
}
