import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { MARKETPLACE_LISTING_MAX_PHOTOS } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB per photo
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Upload photo(s) of the ACTUAL card a seller is listing (not the catalogue
// art) — a real photo of the physical copy is the single biggest trust signal
// for a P2P marketplace buyer. Stored on Vercel Blob (public, immutable URLs);
// the listing itself only ever stores the resulting URLs (see
// lib/marketplace.ts's validateListingInput, which re-validates them belong to
// our own Blob store before they're ever saved to a listing).
//
// Requires BLOB_READ_WRITE_TOKEN (auto-provided once Vercel Blob storage is
// enabled on the project) — without it, `put()` throws and this 500s with a
// clear message rather than failing silently.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!user.isVerifiedSeller) return NextResponse.json({ error: "Please verify your email to sell" }, { status: 403 });

  const rl = rateLimit(`mp-photo:${clientIp(req)}:${user.id}`, 30, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (files.length > MARKETPLACE_LISTING_MAX_PHOTOS) {
    return NextResponse.json({ error: `Upload at most ${MARKETPLACE_LISTING_MAX_PHOTOS} photos at once` }, { status: 400 });
  }

  const urls: string[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `${file.name}: only JPEG, PNG or WebP images are allowed` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name}: photos must be under 8MB` }, { status: 400 });
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    try {
      const blob = await put(`marketplace/${user.id}/${crypto.randomUUID()}.${ext}`, file, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type,
      });
      urls.push(blob.url);
    } catch (e) {
      console.error("[marketplace/photos] upload failed:", e);
      return NextResponse.json(
        { error: "Photo upload failed — the server may not be configured for uploads yet (missing BLOB_READ_WRITE_TOKEN)." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, urls });
}
