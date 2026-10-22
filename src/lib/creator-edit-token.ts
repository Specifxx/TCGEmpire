import { createHash, randomBytes } from "node:crypto";

/** A creator's private edit link token, and the sha256 that is all the database keeps. */
export function newEditToken(): string {
  return randomBytes(24).toString("base64url");
}
export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
