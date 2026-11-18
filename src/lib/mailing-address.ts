// The sender's postal address, printed at the foot of every email we send
// (owner, 2026-11-18). US law (CAN-SPAM) requires a valid physical postal
// address in commercial email; our price alerts, digests and announcements go
// to many US subscribers. One constant so a PO box can replace it in one edit.
export const MAILING_ADDRESS = "12 York Rd, Kellyville NSW 2155, Australia";

/** The address as one email-table row, in the footer's muted style. */
export function mailingAddressRow(color: string, padX = 32): string {
  return `<tr><td style="padding:0 ${padX}px 22px;font-size:11px;line-height:1.5;color:${color}">${MAILING_ADDRESS}</td></tr>`;
}
