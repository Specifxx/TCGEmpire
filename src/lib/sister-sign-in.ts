// SIGN-IN LINKS FOR SISTER SITES WITH ACCOUNTS (2026-11-06, owner: carry the
// "code red" email sign-in fix to every site with accounts). DECISIONS.md,
// "OP Compare signs in by email link, mailed from here".
//
// OP Compare has accounts but no mail service (its sends are script-side and
// its Resend secrets were never set). Rather than hold a mail key there, its
// "Email me a sign-in link" form posts here; we mail the link from our
// verified domain under OP Compare's name, exactly as the sister price alerts
// do, and OP Compare checks the token against our PUBLIC key
// (/api/sister-sign-in/jwks). Nothing secret crosses between the sites.
//
// THE KEY. An Ed25519 key pair derived from AUTH_SECRET (HMAC-SHA256 with a
// fixed label as the 32-byte seed), so it needs no new variable and rotates
// with AUTH_SECRET; the sister fetches the public half and caches it.
// A token says: this address (sub) asked to sign in to that site (aud), in the
// last 30 minutes, with a one-time id (jti) the sister refuses to see twice.
import { createHmac, createPrivateKey, createPublicKey, randomUUID, type KeyObject } from "node:crypto";
import { SignJWT, type JWK } from "jose";
import { authSecret } from "./auth-secret";

export interface SignInSite {
  key: string;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
}

export const SIGN_IN_SITES: SignInSite[] = [{ key: "opcompare", name: "OP Compare", url: "https://opcompare.app" }];

export const SISTER_SIGN_IN_ISSUER = "https://riftcompare.com";
export const SISTER_SIGN_IN_MINUTES = 30;
const KID = "sister-sign-in-1";

export function signInSite(key: unknown): SignInSite | null {
  return SIGN_IN_SITES.find((s) => s.key === key) ?? null;
}

/** The sister whose browser origin this is: its canonical origin or www twin, https, no port. */
export function signInSiteForOrigin(origin: string | null): SignInSite | null {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.port) return null;
    const bare = u.hostname.toLowerCase().replace(/^www\./, "");
    return SIGN_IN_SITES.find((s) => new URL(s.url).hostname === bare) ?? null;
  } catch {
    return null;
  }
}

let keys: { privateKey: KeyObject; publicKey: KeyObject } | null = null;
function keyPair() {
  if (keys) return keys;
  const seed = createHmac("sha256", Buffer.from(authSecret())).update("riftcompare:sister-sign-in:v1").digest();
  // PKCS#8 wrapping of a raw Ed25519 seed (RFC 8410).
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  keys = { privateKey, publicKey: createPublicKey(privateKey) };
  return keys;
}

export function sisterSignInJwks(): { keys: JWK[] } {
  const jwk = keyPair().publicKey.export({ format: "jwk" }) as JWK;
  return { keys: [{ ...jwk, kid: KID, alg: "EdDSA", use: "sig" }] };
}

export async function signSisterSignIn(site: SignInSite, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "EdDSA", kid: KID })
    .setIssuer(SISTER_SIGN_IN_ISSUER)
    .setAudience(site.url)
    .setSubject(email)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${SISTER_SIGN_IN_MINUTES}m`)
    .sign(keyPair().privateKey);
}

/** Where the emailed link goes: the sister's own confirm page, never an API. */
export function sisterSignInUrl(site: SignInSite, token: string, next: unknown): string {
  const q = new URLSearchParams({ token });
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/api") && next.length < 500 && !/[\\\s]/.test(next)) {
    q.set("next", next);
  }
  return `${site.url}/login/email?${q.toString()}`;
}
