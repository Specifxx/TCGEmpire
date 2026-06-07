import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

// Admin-only diagnostic: sends a test email to the signed-in admin via Resend and
// returns the RAW Resend response so we can see exactly why sends fail (e.g. an
// unverified `from` domain). Visit while signed in as the admin:
//   https://riftcompare.com/api/admin/email-test
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Sign in as the admin account first, then reload this URL." }, { status: 403 });
  }

  const key = process.env.RESEND_API_KEY;
  // Mirror lib/email.ts so this tests the REAL sender used by reset/verify emails.
  const from = process.env.EMAIL_FROM ?? "RiftCompare <noreply@riftcompare.com>";
  if (!key) {
    return NextResponse.json({ ok: false, problem: "RESEND_API_KEY is not set in this deployment." });
  }

  let httpStatus = 0;
  let resendResponse = "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: user.email,
        subject: "RiftCompare email test ✅",
        html: "<p>If you're reading this, RiftCompare transactional email is working.</p>",
      }),
    });
    httpStatus = res.status;
    resendResponse = (await res.text()).slice(0, 800);
  } catch (e) {
    return NextResponse.json({ ok: false, problem: "Request to Resend failed", error: String(e), from });
  }

  return NextResponse.json({
    ok: httpStatus >= 200 && httpStatus < 300,
    httpStatus,
    sentFrom: from,
    sentTo: user.email,
    resendResponse,
    hint:
      httpStatus >= 200 && httpStatus < 300
        ? "Resend accepted it — check your inbox AND spam. If it's there, email works."
        : "Resend rejected it — the resendResponse above says why (usually the `from` domain isn't verified).",
  });
}
