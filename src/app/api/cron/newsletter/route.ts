import { NextResponse } from "next/server";
import { runNewsletterDigest } from "@/lib/newsletter";

// Weekly Index-summary digest to the footer-signup list. Triggered by Vercel
// Cron (see vercel.json) Friday 21:00 UTC — after the Friday price refresh —
// or any scheduler hitting this URL with Authorization: Bearer <CRON_SECRET>.
// Idempotent per ISO week: reruns only email subscribers still due.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runNewsletterDigest();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "newsletter run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
