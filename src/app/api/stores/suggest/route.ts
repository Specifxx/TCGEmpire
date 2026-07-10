import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { RETAILER_LIST } from "@/lib/retailers";

export const dynamic = "force-dynamic";

const COUNTRIES = new Set(["AU", "NZ", "US", "UK", "SG", "OTHER"]);

// Normalise a submitted URL to a bare hostname (lowercase, no www) so we can
// dedupe against stores we already track and against earlier submissions.
function hostOf(raw: string): string | null {
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const trackedHosts = new Set(RETAILER_LIST.map((r) => hostOf(r.base)).filter(Boolean) as string[]);

// Public "Suggest a store" endpoint. Anyone (usually a store owner wanting a free
// listing) can submit a shop; we save it as pending for manual review. Rate-limited
// and deduped so the review queue stays clean.
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`suggest-store:${ip}`, 5, 60 * 60 * 1000); // 5/hour/IP
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  const storeName = typeof body?.storeName === "string" ? body.storeName.trim().slice(0, 120) : "";
  const rawUrl = typeof body?.storeUrl === "string" ? body.storeUrl.trim().slice(0, 300) : "";
  const country = COUNTRIES.has(body?.country) ? body.country : "AU";
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : "";

  if (!storeName || !rawUrl) {
    return NextResponse.json({ error: "Please enter the store name and website." }, { status: 400 });
  }
  const host = hostOf(rawUrl);
  if (!host || !host.includes(".")) {
    return NextResponse.json({ error: "That doesn't look like a valid website address." }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  const storeUrl = `https://${host}`;

  if (trackedHosts.has(host)) {
    return NextResponse.json({ ok: true, already: true, message: "Good news — we already compare that store!" });
  }

  try {
    // Dedupe: if this host is already queued/handled, don't create a second row.
    const existing = await prisma.storeSuggestion.findFirst({ where: { storeUrl } });
    if (!existing) {
      await prisma.storeSuggestion.create({
        data: { storeName, storeUrl, country, email: email || null, note: note || null, ip },
      });
    }
  } catch {
    return NextResponse.json({ error: "Couldn't submit right now — please try again shortly." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
