import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { DRAND_API } from "./giveaway";
import { sisterKeyPair, SISTER_SIGN_IN_ISSUER } from "./sister-sign-in";

// The draw's arithmetic and the winner's claim token (server and scripts only: node:crypto). DECISIONS.md, 2026-11-22.
//
// The winning ticket is drand's public randomness (a 64-hex-digit number) modulo the number of tickets, plus one. A redraw
// (the first winner did not claim) uses SHA-256 of "<randomness>:<attempt>", over the tickets left once every earlier winner is
// taken out, so each redraw is as checkable as the first.

export function drawSeed(randomness: string, attempt: number): string {
  const r = randomness.toLowerCase();
  if (!/^[0-9a-f]{16,128}$/.test(r)) throw new Error("drand randomness must be hex");
  return attempt === 0 ? r : createHash("sha256").update(`${r}:${attempt}`).digest("hex");
}

/** The winning ticket, 1 to `total`. */
export function winningTicket(randomness: string, total: number, attempt = 0): number {
  if (!Number.isInteger(total) || total < 1) throw new Error("no tickets");
  return Number(BigInt(`0x${drawSeed(randomness, attempt)}`) % BigInt(total)) + 1;
}

export interface DrandRound {
  round: number;
  randomness: string;
}

/** One drand round, or null when it is not published yet (or drand did not answer). */
export async function fetchDrandRound(round: number, f: typeof fetch = fetch): Promise<DrandRound | null> {
  try {
    const r = await f(`${DRAND_API}/${round}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { round?: unknown; randomness?: unknown };
    if (j.round !== round || typeof j.randomness !== "string" || !/^[0-9a-f]{64}$/i.test(j.randomness)) return null;
    return { round, randomness: j.randomness.toLowerCase() };
  } catch {
    return null;
  }
}

// The claim link's token: names the giveaway (aud) and the winning account (sub), lasts until the claim deadline. Signed with the
// sister sign-in key under `use: "giveaway-claim"`, which no other token carries.
export async function signClaimToken(giveaway: string, userId: string, claimBy: Date): Promise<string> {
  return new SignJWT({ use: "giveaway-claim" })
    .setProtectedHeader({ alg: "EdDSA", kid: "sister-sign-in-1" })
    .setIssuer(SISTER_SIGN_IN_ISSUER)
    .setAudience(`giveaway:${giveaway}`)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(claimBy.getTime() / 1000))
    .sign(sisterKeyPair().privateKey);
}

export async function verifyClaimToken(token: unknown): Promise<{ giveaway: string; userId: string } | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, sisterKeyPair().publicKey, { issuer: SISTER_SIGN_IN_ISSUER, algorithms: ["EdDSA"] });
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (payload.use !== "giveaway-claim" || typeof payload.sub !== "string" || typeof aud !== "string" || !aud.startsWith("giveaway:")) return null;
    return { giveaway: aud.slice("giveaway:".length), userId: payload.sub };
  } catch {
    return null;
  }
}
