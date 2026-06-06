import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const SESSION_COOKIE = "tcge_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "tcgempire-dev-secret-change-me"
);

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
  balanceCents: number;
  isAdmin: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
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
    .sign(secret);

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
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub as string;
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      balanceCents: user.balanceCents,
      isAdmin: user.isAdmin || isAdminEmail(user.email),
    };
  } catch {
    return null;
  }
}
