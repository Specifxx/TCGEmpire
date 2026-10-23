// What the website can see about itself, for GET /api/cron/ops-notify: whether the
// settings it needs are present and whether its mail keys are accepted. It returns the
// NAMES of missing settings and yes/no answers, never a value; the caller is the ops
// monitor in GitHub Actions, which holds none of these keys.
import { OPERATIONAL_VARS, HISTORY_VARS } from "../db-chains";
import type { SiteSelfReport } from "./checks";

/** Settings the live site cannot run without. Names only. */
export function requiredEnvNames(): string[] {
  // Only what the WEBSITE reads. The eBay keys belong to the importers in GitHub Actions (the site never
  // calls eBay), and ADMIN_TOKEN is an optional ?key= shortcut beside the admin login; both were false
  // alarms on the first live run (2026-10-14).
  return ["AUTH_SECRET", "CRON_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", OPERATIONAL_VARS[0]];
}

/** What the site knows about itself beyond its environment (read by the route, passed in). */
export interface SelfFacts {
  /** StorePlanSubscription rows; null when the count could not be read. */
  storePlanSubscriptions?: number | null;
}

export function missingEnv(env: Record<string, string | undefined> = process.env, facts: SelfFacts = {}): string[] {
  const missing = requiredEnvNames().filter((n) => !(env[n] ?? "").trim());
  // The history database: any one name in its chain counts.
  if (!HISTORY_VARS.some((n) => (env[n] ?? "").trim())) missing.push(HISTORY_VARS[0]);
  // The Stores plan (lib/store-plan.ts): optional until a store has bought it,
  // then required — without it renewals stop extending the plan (the webhook
  // also matches on metadata, but the checkout and the sales page switch off)
  // and paying stores lose their report.
  if ((facts.storePlanSubscriptions ?? 0) > 0 && !(env.STRIPE_STORE_PRICE_ID ?? "").trim()) missing.push("STRIPE_STORE_PRICE_ID");
  return missing;
}

async function probe(url: string, headers: Record<string, string>): Promise<{ valid: boolean | null; detail?: string }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) return { valid: true };
    if (res.status === 401 || res.status === 403) {
      // A Resend key with "sending access" only is refused on /domains as restricted_api_key: it is a
      // working key that may not list domains, not a rejected one.
      const body = (await res.json().catch(() => null)) as { name?: string } | null;
      if (body?.name === "restricted_api_key") return { valid: true, detail: "send-only key" };
      return { valid: false, detail: `HTTP ${res.status}` };
    }
    return { valid: null, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { valid: null, detail: e instanceof Error ? e.message.slice(0, 80) : "unreachable" };
  }
}

export async function siteSelfReport(env: Record<string, string | undefined> = process.env, facts: SelfFacts = {}): Promise<SiteSelfReport> {
  const resendKey = env.RESEND_API_KEY;
  const brevoKey = env.BREVO_API_KEY;
  const [resend, brevo] = await Promise.all([
    resendKey ? probe("https://api.resend.com/domains", { Authorization: `Bearer ${resendKey}` }) : Promise.resolve({ valid: null as boolean | null }),
    brevoKey ? probe("https://api.brevo.com/v3/account", { "api-key": brevoKey, accept: "application/json" }) : Promise.resolve({ valid: null as boolean | null }),
  ]);
  return {
    ok: true,
    resend: { configured: !!resendKey, ...resend },
    brevo: { configured: !!brevoKey, ...brevo },
    missingEnv: missingEnv(env, facts),
  };
}
