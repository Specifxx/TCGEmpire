// What the website can see about itself, for GET /api/cron/ops-notify: whether the
// settings it needs are present and whether its mail keys are accepted. It returns the
// NAMES of missing settings and yes/no answers, never a value; the caller is the ops
// monitor in GitHub Actions, which holds none of these keys.
import { OPERATIONAL_VARS, HISTORY_VARS } from "../db-chains";
import type { SiteSelfReport } from "./checks";

/** Settings the live site cannot run without. Names only. */
export function requiredEnvNames(): string[] {
  return ["AUTH_SECRET", "CRON_SECRET", "ADMIN_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", OPERATIONAL_VARS[0]];
}

export function missingEnv(env: Record<string, string | undefined> = process.env): string[] {
  const missing = requiredEnvNames().filter((n) => !(env[n] ?? "").trim());
  // The history database: any one name in its chain counts.
  if (!HISTORY_VARS.some((n) => (env[n] ?? "").trim())) missing.push(HISTORY_VARS[0]);
  return missing;
}

async function probe(url: string, headers: Record<string, string>): Promise<{ valid: boolean | null; detail?: string }> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) return { valid: true };
    if (res.status === 401 || res.status === 403) return { valid: false, detail: `HTTP ${res.status}` };
    return { valid: null, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { valid: null, detail: e instanceof Error ? e.message.slice(0, 80) : "unreachable" };
  }
}

export async function siteSelfReport(env: Record<string, string | undefined> = process.env): Promise<SiteSelfReport> {
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
    missingEnv: missingEnv(env),
  };
}
