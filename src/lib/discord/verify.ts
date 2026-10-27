// Discord signs every interaction with Ed25519 (X-Signature-Ed25519 over
// X-Signature-Timestamp + body). An endpoint that answers an unsigned request is
// refused by Discord's setup check, so this runs before anything else.
// Node's own crypto: no dependency.
import { createPublicKey, verify } from "node:crypto";

// DER prefix that turns a raw 32-byte Ed25519 key into SPKI.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string): boolean {
  if (!signatureHex || !timestamp) return false;
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}
