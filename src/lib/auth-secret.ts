// THE ONE SERVER SECRET (AUTH_SECRET), resolved once. Split out of lib/auth.ts
// (2026-09-25) so a signer that is not a session — the price-alert one-tap
// links in lib/alert-actions.ts — reuses the same secret and the same refusal
// policy without importing next/headers and the Prisma client with it.
//
// Resolved lazily so a missing value fails at request time, not build time. In
// production a missing or known-default value THROWS: signing with a public,
// hardcoded secret would let anyone forge a session cookie (full account
// takeover) or an alert action link. Outside production a dev-only secret is
// used, with a loud warning.
let cachedSecret: Uint8Array | null = null;

export function authSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const s = process.env.AUTH_SECRET;
  if (!s || s === "change-me-in-production" || s === "tcgempire-dev-secret-change-me") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET is not set (or still the insecure default). Refusing to sign/verify " +
          "sessions in production. Generate one with: " +
          "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    console.warn(
      "[auth] AUTH_SECRET not set — using an insecure development-only secret. NEVER use this in production."
    );
    cachedSecret = new TextEncoder().encode("tcgempire-dev-secret-change-me");
    return cachedSecret;
  }
  cachedSecret = new TextEncoder().encode(s);
  return cachedSecret;
}
