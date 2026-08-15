import { NextResponse } from "next/server";

// Lightweight, dependency-free, in-memory rate limiter. Zero-config so it works
// out of the box on every deploy.
//
// IMPORTANT: on serverless (Vercel) each function instance has its own memory, so
// these limits are per-instance and reset on cold start. That meaningfully slows
// brute-force logins and email-bombing, but it is NOT a hard global cap. For strict
// global limits, back this with Upstash Redis (@upstash/ratelimit) or configure
// Vercel Firewall rate-limit rules in front of these routes.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Drop expired buckets occasionally so the map can't grow without bound.
function sweep(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // seconds until the window resets
}

// Returns ok:false once more than `limit` calls share a key inside `windowMs`.
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > 10_000) sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

// Best-effort client IP. Vercel sets x-forwarded-for; fall back to x-real-ip.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Standard 429 response with a Retry-After header.
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
