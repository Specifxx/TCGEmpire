import { createSign } from "node:crypto";

// Google Search Console clicks per day, script-side only (GitHub Actions holds
// GSC_SA_KEY; Vercel never does). scripts/growth-snapshot.ts stores the result in
// OpsSnapshot "growth:gsc" for /admin/growth, the owner's growth view
// (2026-10-27: "I need to be able to visualize this growth"). Same service-account
// flow as scripts/impact-report.ts.

export interface GscDay {
  d: string; // YYYY-MM-DD, Search Console's own (Pacific) day
  clicks: number;
  impr: number;
  pos: number;
}

async function token(raw: string): Promise<string> {
  const sa = JSON.parse(raw) as { client_email: string; private_key: string };
  const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const s = createSign("RSA-SHA256");
  s.update(`${h}.${c}`);
  const jwt = `${h}.${c}.${b64(s.sign(sa.private_key))}`;
  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const tok = ((await tr.json()) as { access_token?: string }).access_token;
  if (!tok) throw new Error(`token request failed (${tr.status})`);
  return tok;
}

/** Clicks, impressions and average position per day for one property. Throws on any failure. */
export async function fetchGscDaily(raw: string, property: string, start: string, end: string): Promise<GscDay[]> {
  const tok = await token(raw);
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["date"], rowLimit: 500 }),
  });
  if (!r.ok) throw new Error(`searchAnalytics ${r.status}`);
  const j = (await r.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[] };
  return (j.rows ?? []).map((row) => ({ d: row.keys[0], clicks: row.clicks, impr: row.impressions, pos: row.position })).sort((a, b) => a.d.localeCompare(b.d));
}
