import { NextResponse } from "next/server";
import { createHash } from "crypto";

// eBay Marketplace Account Deletion / Closure Notifications endpoint.
// Required to enable production API keys. We do NOT store any eBay user data
// (we only read public listings), so there is nothing to delete — we just satisfy
// eBay's validation challenge and acknowledge notifications.
//
// Configure in the eBay developer portal (Alerts & Notifications → Marketplace
// account deletion) with:
//   Endpoint URL: https://<your-domain>/api/ebay/marketplace-deletion
//   Verification token: the value of EBAY_VERIFICATION_TOKEN (32–80 chars)
// and set EBAY_DELETION_ENDPOINT to that exact same URL.

export const dynamic = "force-dynamic";

const TOKEN = process.env.EBAY_VERIFICATION_TOKEN ?? "";
const ENDPOINT = process.env.EBAY_DELETION_ENDPOINT ?? "";

// Validation handshake: eBay sends ?challenge_code=… and expects
// sha256(challengeCode + verificationToken + endpoint) as hex.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challengeCode = searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ error: "missing challenge_code" }, { status: 400 });
  }
  const challengeResponse = createHash("sha256")
    .update(challengeCode)
    .update(TOKEN)
    .update(ENDPOINT)
    .digest("hex");

  return NextResponse.json({ challengeResponse }, { status: 200 });
}

// Account-deletion notification: acknowledge with 200. Nothing to delete since we
// store no eBay user data.
export async function POST(req: Request) {
  await req.text().catch(() => "");
  return new NextResponse(null, { status: 200 });
}
