import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { Hot40Image, HOT40_SIZE } from "@/lib/hot40-og";
import { snapshotDateLabel, type RisingSnapshotData } from "@/lib/rising-snapshot";

// The unfurl for a shared Hot 40 link.
//
// Owner, 2026-09-22, in two passes: first "a better thumbnail with the card at
// #1 featured", then "it should also have #2 and #3 and some delta figures".
// Before any of this the route had no opengraph-image at all, so every
// forwarded link fell through to the site-wide default — the same generic
// picture in Discord, iMessage and X whichever snapshot you sent.
//
// THE COMPOSITION LIVES IN lib/hot40-og.tsx, not here: a Next image route may
// only export the names Next recognises, and keeping the drawing in a plain
// module means it can be rendered from a fixture and looked at without a
// database (scripts/render-hot40-og.tsx). This file is only the data hop.
//
// NOTHING IS COMPUTED. Every figure drawn comes straight off the FROZEN `data`
// column, the same values the page shows, so the picture and the page can never
// disagree and a link shared three weeks ago still unfurls with the cards that
// actually led it rather than today's leaders.
//
// Fails open to a brand-only composition on a missing token, an empty run or a
// database blip — an unfurl must produce an image, never a 500.
//
// runtime = "nodejs" because Prisma cannot run on edge, matching the other two
// data-backed OG routes (app/opengraph-image.tsx, blog/[slug]).
export const runtime = "nodejs";
export const size = HOT40_SIZE;
export const contentType = "image/png";
export const alt = "RiftCompare Hot 40 — Riftbound cards ranked by demand and price-timing signals";

export default async function Image({ params }: { params: { token: string } }) {
  const snap = await prisma.risingSnapshot
    .findUnique({ where: { token: params.token }, select: { data: true, createdAt: true } })
    .catch(() => null);

  const data = (snap?.data ?? null) as RisingSnapshotData | null;
  return new ImageResponse(
    <Hot40Image picks={data?.picks ?? []} dateLabel={snap ? snapshotDateLabel(new Date(snap.createdAt)) : null} />,
    size,
  );
}
