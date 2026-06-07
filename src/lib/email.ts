import { SITE_NAME, SITE_URL } from "./site";

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Send a transactional email via Resend's REST API. Requires RESEND_API_KEY (and
// ideally a verified sender in EMAIL_FROM) to actually deliver; otherwise it
// no-ops and logs, so the rest of the app keeps working without email configured.
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — "${subject}" to ${to} was NOT sent.`);
    return false;
  }
  const from = process.env.EMAIL_FROM ?? `${SITE_NAME} <onboarding@resend.dev>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) console.warn(`[email] Resend returned ${res.status} for "${subject}".`);
    return res.ok;
  } catch (e) {
    console.warn("[email] send failed:", e);
    return false;
  }
}

// On-brand HTML wrapper for transactional emails.
function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0e14;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#131a26;border:1px solid #233047;border-radius:16px">
      <tr><td style="padding:28px 32px 6px"><div style="font-size:22px;font-weight:800;color:#fff">Rift<span style="color:#34d17e">Compare</span></div></td></tr>
      <tr><td style="padding:6px 32px 4px"><h1 style="margin:0;font-size:20px;color:#fff">${heading}</h1></td></tr>
      <tr><td style="padding:8px 32px 16px;font-size:14px;line-height:1.6;color:#b8c0cc">${body}</td></tr>
      <tr><td style="padding:4px 32px 26px"><a href="${cta.url}" style="display:inline-block;background:#34d17e;color:#06210f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${cta.label}</a></td></tr>
      <tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">RiftCompare · Riftbound card price comparison.<br/>If you didn't request this, you can safely ignore this email.</td></tr>
    </table></td></tr></table></body></html>`;
}

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  return sendEmail(
    to,
    "Confirm your RiftCompare email",
    layout("Confirm your email", "Thanks for signing up — confirm your email address to finish setting up your RiftCompare account.", {
      label: "Confirm email",
      url: `${SITE_URL}/verify?token=${encodeURIComponent(token)}`,
    })
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  return sendEmail(
    to,
    "Reset your RiftCompare password",
    layout("Reset your password", "We received a request to reset your RiftCompare password. This link expires in 1 hour.", {
      label: "Reset password",
      url: `${SITE_URL}/reset?token=${encodeURIComponent(token)}`,
    })
  );
}
