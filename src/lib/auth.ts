import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const SESSION_COOKIE = "tcge_session";

// Resolve the session-signing secret lazily so a missing value fails at request
// time (not build time). In production we refuse to fall back to a known default —
// signing sessions with a public, hardcoded secret would let anyone forge a cookie
// for any user (full account takeover). Outside production we allow a dev-only
// secret with a loud warning.
let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
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

// Moderator emails (override via ADMIN_EMAILS env, comma-separated). These accounts
// get delete-any privileges. Not surfaced anywhere in the UI.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "mastermisclick@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  balanceCents: number;
  isAdmin: boolean;
  // Shards (gamification). points = spendable balance; canCheckIn drives the daily
  // check-in nudge in the navbar.
  points: number;
  canCheckIn: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// One-time tokens for email verification / password reset.
export async function createAuthToken(
  userId: string,
  purpose: "verify" | "reset",
  ttlMs = 60 * 60 * 1000
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.authToken.create({
    data: { token, purpose, userId, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

// Consume a token: returns the userId if valid+unexpired (and deletes it), else null.
export async function consumeAuthToken(
  token: string,
  purpose: "verify" | "reset"
): Promise<string | null> {
  const row = await prisma.authToken.findUnique({ where: { token } });
  if (!row || row.purpose !== purpose) return null;
  await prisma.authToken.delete({ where: { id: row.id } }).catch(() => {});
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row.userId;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Issue a signed session cookie for the given user id.
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function destroySession(): void {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

// Read + verify the session cookie and load the current user, or null.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub as string;
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    // "Today" in UTC, matching the check-in dedupe key in lib/points.
    const today = new Date().toISOString().slice(0, 10);
    const lastCheckin = user.lastCheckinAt ? user.lastCheckinAt.toISOString().slice(0, 10) : null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      emailVerified: !!user.emailVerified,
      balanceCents: user.balanceCents,
      isAdmin: user.isAdmin || isAdminEmail(user.email),
      points: user.points,
      canCheckIn: lastCheckin !== today,
    };
  } catch {
    return null;
  }
}
