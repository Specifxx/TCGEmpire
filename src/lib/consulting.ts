// Paid store consulting (/stores/consulting) — one place for what the session
// costs, how long it runs, and what a valid booking looks like.
//
// DEPENDENCY-FREE ON PURPOSE, like lib/site.ts: the marketing page, the client
// form, the API route that charges the card and the tests all import from here,
// so the number a store is quoted and the number Stripe is told to charge can
// never drift apart. Nothing in this file may import prisma, stripe or anything
// server-only — the form is a client component.
//
// PRICING IS ENV-OVERRIDABLE BUT HAS A REAL DEFAULT. There is no Stripe Price
// object to create in the Dashboard first: the Checkout Session builds its line
// item inline from these values (see api/stores/consulting/route.ts), so the
// page works the moment STRIPE_SECRET_KEY exists. Changing the price is one env
// var, and past bookings keep the amount they actually paid (ConsultBooking
// records amountCents at booking time, never reads it back from here).

const envInt = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/** What one session costs, in the smallest currency unit. */
export const CONSULT_PRICE_CENTS = envInt("CONSULT_PRICE_CENTS", 25_000);

/**
 * Lowercase ISO code for Stripe, uppercase for display/formatMoney. AUD is the
 * default because that is the market RiftCompare's own price comparison is
 * anchored to; a store anywhere else still pays in AUD and Stripe converts.
 */
export const CONSULT_CURRENCY = (process.env.CONSULT_CURRENCY ?? "aud").toLowerCase();
export const CONSULT_CURRENCY_DISPLAY = CONSULT_CURRENCY.toUpperCase();

/** Scheduled length of the call, in minutes. */
export const CONSULT_DURATION_MIN = envInt("CONSULT_DURATION_MIN", 60);

/**
 * Optional self-serve scheduling link (Cal.com, Calendly, whatever). When it is
 * set, the post-payment page sends the store straight there; when it is not —
 * the default — the same page says the owner will email to agree a time, which
 * is the truth rather than a promise of a booking widget that doesn't exist.
 * NEXT_PUBLIC_ so the confirmation page can render it without a server read.
 */
export const CONSULT_SCHEDULING_URL = process.env.NEXT_PUBLIC_CONSULT_SCHEDULING_URL ?? "";

/** How soon the owner commits to replying with times. Stated on the page AND in the email. */
export const CONSULT_REPLY_HOURS = envInt("CONSULT_REPLY_HOURS", 24);

/** Markets a store can pick — the same set /api/stores/suggest accepts. */
export const CONSULT_MARKETS = ["AU", "US", "UK", "SG", "CA", "EU", "OTHER"] as const;
export type ConsultMarket = (typeof CONSULT_MARKETS)[number];

export interface ConsultBookingInput {
  storeName: string;
  storeUrl: string;
  contactName: string;
  email: string;
  country: string;
  goals: string;
  preferredTimes: string;
}

/**
 * What the route persists: the same fields, except `storeUrl` has been through
 * normalizeStoreUrl and is null when the store didn't give one. Omit-then-widen
 * rather than a plain intersection — `string & (string | null)` is just
 * `string`, which would quietly type a null as a string.
 */
export type ConsultBookingValues = Omit<ConsultBookingInput, "storeUrl"> & { storeUrl: string | null };

export interface ConsultValidation {
  ok: boolean;
  error?: string;
  /** Present only when ok — trimmed, length-capped, safe to persist. */
  value?: ConsultBookingValues;
}

/**
 * Normalise a submitted URL to `https://<bare host>`, matching what
 * /api/stores/suggest already stores, so a booking and a suggestion for the
 * same shop can be matched by eye in the admin inbox. Returns null for
 * anything that isn't a plausible hostname.
 */
export function normalizeStoreUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return host.includes(".") ? `https://${host}` : null;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The one validator both the route and its tests run. Store name, contact name
 * and a working email are required — everything else is optional, because a
 * store owner filling this in on a phone between customers should not be
 * blocked from paying us over a field we can ask about on the call.
 */
export function validateConsultBooking(body: unknown): ConsultValidation {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const storeName = str(b.storeName, 120);
  const contactName = str(b.contactName, 120);
  const email = str(b.email, 200);
  const rawUrl = str(b.storeUrl, 300);
  const goals = str(b.goals, 2000);
  const preferredTimes = str(b.preferredTimes, 500);
  const country = (CONSULT_MARKETS as readonly string[]).includes(str(b.country, 10))
    ? str(b.country, 10)
    : "AU";

  if (!storeName) return { ok: false, error: "Please tell us your store's name." };
  if (!contactName) return { ok: false, error: "Please tell us who we'll be speaking with." };
  if (!email) return { ok: false, error: "Please enter an email address so we can confirm a time." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That email address doesn't look right." };

  // A store URL is optional, but a mistyped one is worth catching now rather
  // than discovering on the call that we prepared the wrong catalogue.
  const storeUrl = rawUrl ? normalizeStoreUrl(rawUrl) : null;
  if (rawUrl && !storeUrl) {
    return { ok: false, error: "That doesn't look like a valid website address." };
  }

  return {
    ok: true,
    value: { storeName, storeUrl, contactName, email, country, goals, preferredTimes },
  };
}
