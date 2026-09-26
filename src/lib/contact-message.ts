// Validation for the /contact form (/api/contact → ContactMessage).
//
// WHY THIS EXISTS (2026-09-26). /admin/messages has always read ContactMessage,
// but nothing ever wrote it: /contact was a mailto link only, so the inbox's
// "Contact messages" section could never show a row. Dependency-free so the
// route and its test share one rule.

export const CONTACT_MAX_NAME = 80;
export const CONTACT_MAX_EMAIL = 200;
export const CONTACT_MAX_SUBJECT = 150;
export const CONTACT_MAX_MESSAGE = 4000;
export const CONTACT_MIN_MESSAGE = 10;

export type ContactInput =
  | { ok: true; spam: true }
  | { ok: true; spam: false; data: { name: string; email: string; subject: string | null; message: string } }
  | { ok: false; error: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseContactMessage(body: unknown): ContactInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  // Honeypot (display:none, as on the wrong-price form): a bot fills it; accept
  // and drop so the script learns nothing.
  if (typeof b.website === "string" && b.website.trim() !== "") return { ok: true, spam: true };

  const name = str(b.name, CONTACT_MAX_NAME);
  const email = str(b.email, CONTACT_MAX_EMAIL);
  const subject = str(b.subject, CONTACT_MAX_SUBJECT) || null;
  const message = str(b.message, CONTACT_MAX_MESSAGE);

  if (!name) return { ok: false, error: "Please add your name." };
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email address doesn't look right — we need it to reply." };
  }
  if (message.length < CONTACT_MIN_MESSAGE) {
    return { ok: false, error: "Write a little more (at least 10 characters)." };
  }
  return { ok: true, spam: false, data: { name, email, subject, message } };
}
