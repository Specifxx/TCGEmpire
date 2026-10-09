// The signed counter cookie behind the daily search allowance (lib/search-quota.ts).
// Node only (node:crypto), and free of Next.js imports so tests can drive it.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { QuotaState } from "./search-quota";

function mac(secret: Uint8Array | string, body: string): string {
  return createHmac("sha256", Buffer.from(secret as Uint8Array))
    .update("search-quota:v1:")
    .update(body)
    .digest("base64url");
}

export function encodeQuota(s: QuotaState, secret: Uint8Array | string): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

export function decodeQuota(raw: string | undefined | null, secret: Uint8Array | string): QuotaState | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const want = mac(secret, body);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QuotaState;
    if (typeof s?.d !== "string" || typeof s?.n !== "number" || typeof s?.q !== "string" || typeof s?.u !== "string") return null;
    return { d: s.d, n: Math.max(0, Math.floor(s.n)), q: s.q.slice(0, 120), u: s.u };
  } catch {
    return null;
  }
}

