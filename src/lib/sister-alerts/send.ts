// Which provider sends a sister site's alert mail. DexCompare has its own Brevo
// account (owner, 2026-11-10: its mail should not eat RiftCompare's Resend
// quota), authenticated for dexcompare.app. With DEX_BREVO_API_KEY set, a Dex
// mail goes out from alerts@dexcompare.app through it; if that send fails, or
// no key exists, it falls back to the shared Resend sender exactly as before.
import { sendEmail, sendEmailBrevoAccount } from "../email";

export interface SisterMailExtras {
  text: string;
  headers?: Record<string, string>;
  from: string;
}

export const DEX_BREVO_KEY_ENV = "DEX_BREVO_API_KEY";
export const DEX_FROM_DEFAULT = "DexCompare alerts <alerts@dexcompare.app>";

export async function sendSisterMail(
  siteKey: string | undefined,
  to: string,
  subject: string,
  html: string,
  extras: SisterMailExtras,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (siteKey === "dex" && env[DEX_BREVO_KEY_ENV]) {
    const from = env.DEX_EMAIL_FROM ?? DEX_FROM_DEFAULT;
    if (await sendEmailBrevoAccount(env[DEX_BREVO_KEY_ENV], DEX_BREVO_KEY_ENV, from, to, subject, html, { ...extras, from })) return true;
  }
  return sendEmail(to, subject, html, extras);
}
