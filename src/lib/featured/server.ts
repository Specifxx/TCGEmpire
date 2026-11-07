import { unstable_cache } from "next/cache";
import { prisma } from "../db";
import { isPremium, type EntitlementUser } from "../premium";
import type { FeaturedListing } from "../featured-listings";
import {
  FEATURED_TAG,
  MEMBER_FEATURE_LIMIT,
  featureEndsAt,
  isEbayShortLink,
  parseEbayItemLink,
  type FeatureStatus,
} from "./core";

// MEMBER-FEATURED LISTINGS, the request half (lib/featured/core.ts has the
// rules). Per member, uncached, called only from /api/featured-listings, like
// the other member libraries; the one public read is getLiveFeatured, cached
// six hours and refreshed by the sweep's purge (/api/cron/featured-listings).

/** Follow an eBay app share link (ebay.io/m/…) to the item page it names. */
export async function resolveShortLink(input: string): Promise<string | null> {
  let url = input.trim();
  for (let hop = 0; hop < 4; hop++) {
    if (parseEbayItemLink(url)) return url;
    if (hop > 0 && !/^https:\/\/([a-z0-9-]+\.)*ebay\.[a-z.]+\//i.test(url) && !isEbayShortLink(url)) return null;
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "RiftCompare link check" } });
    } catch {
      return null;
    }
    const next = res.headers.get("location");
    if (!next) return null;
    url = new URL(next, url).toString();
  }
  return parseEbayItemLink(url) ? url : null;
}

export interface MyFeature {
  id: string;
  itemId: string;
  status: FeatureStatus;
  reason: string | null;
  title: string | null;
  endsAt: string | null;
  createdAt: string;
}

const MINE_SELECT = { id: true, itemId: true, status: true, reason: true, title: true, endsAt: true, createdAt: true } as const;

export async function listMyFeatures(userId: string): Promise<MyFeature[]> {
  const rows = await prisma.featuredSubmission.findMany({
    where: { userId, status: { not: "removed" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: MINE_SELECT,
  });
  return rows.map((r) => ({
    ...r,
    status: r.status as FeatureStatus,
    endsAt: r.endsAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function submitFeature(user: { id: string } & EntitlementUser, link: string) {
  if (!isPremium(user, "premium")) return { status: 403, body: { error: "premium_required" } };
  const raw = String(link ?? "").slice(0, 2000);
  const resolved = isEbayShortLink(raw) ? await resolveShortLink(raw) : raw;
  const parsed = resolved ? parseEbayItemLink(resolved) : null;
  if (!parsed) {
    return {
      status: 400,
      body: { error: "link", message: "Paste the link to one eBay listing (eBay AU, US, UK, CA, ES or SG), or eBay's share link." },
    };
  }
  const active = await prisma.featuredSubmission.count({ where: { userId: user.id, status: { in: ["pending", "live"] } } });
  const existing = await prisma.featuredSubmission.findUnique({ where: { itemId: parsed.itemId }, select: { userId: true, status: true } });
  if (existing && existing.userId !== user.id && (existing.status === "pending" || existing.status === "live")) {
    return { status: 409, body: { error: "taken", message: "That listing is already featured." } };
  }
  const reopening = existing?.userId === user.id && (existing.status === "pending" || existing.status === "live");
  if (!reopening && active >= MEMBER_FEATURE_LIMIT) {
    return { status: 409, body: { error: "limit", message: `You can feature ${MEMBER_FEATURE_LIMIT} listings at a time. Remove one first.` } };
  }
  const reset = { status: "pending", reason: null, checkedAt: null, createdAt: new Date() };
  const row = existing
    ? reopening
      ? await prisma.featuredSubmission.findUniqueOrThrow({ where: { itemId: parsed.itemId }, select: MINE_SELECT })
      : await prisma.featuredSubmission.update({ where: { itemId: parsed.itemId }, data: { ...reset, userId: user.id, host: parsed.host }, select: MINE_SELECT })
    : await prisma.featuredSubmission.create({ data: { userId: user.id, itemId: parsed.itemId, host: parsed.host }, select: MINE_SELECT });
  return { status: 200, body: { ok: true, id: row.id } };
}

export async function removeFeature(userId: string, id: string) {
  const r = await prisma.featuredSubmission.updateMany({ where: { id, userId }, data: { status: "removed", reason: "Removed by you." } });
  return { status: 200, body: { ok: true, removed: r.count } };
}

/** Admin: take a listing down (or put a rejected one back to pending). */
export async function adminSetFeature(id: string, action: "remove" | "recheck") {
  const data = action === "remove" ? { status: "removed", reason: "Removed by RiftCompare." } : { status: "pending", reason: null, checkedAt: null };
  await prisma.featuredSubmission.update({ where: { id }, data });
}

const LIVE_SELECT = {
  itemId: true,
  host: true,
  title: true,
  priceCents: true,
  currency: true,
  imageUrl: true,
  format: true,
  bids: true,
  endsAt: true,
  seller: true,
  location: true,
  condition: true,
  checkedAt: true,
  createdAt: true,
} as const;

const HOST_MARKET: Record<string, string> = { "ebay.com.au": "AU", "ebay.com": "US", "ebay.co.uk": "UK", "ebay.ca": "CA", "ebay.es": "EU", "ebay.com.sg": "SG" };

/** A live member row in the shape FeaturedListingBox draws. */
export interface MemberFeatured extends FeaturedListing {
  byMember: true;
}

async function loadLive(): Promise<MemberFeatured[]> {
  const rows = await prisma.featuredSubmission.findMany({
    where: { status: "live" },
    orderBy: [{ endsAt: "asc" }, { createdAt: "desc" }],
    take: 60,
    select: LIVE_SELECT,
  });
  const out: MemberFeatured[] = [];
  for (const r of rows) {
    if (!r.title || !r.priceCents || !r.currency || !r.checkedAt) continue;
    const created = r.createdAt.toISOString();
    const ends = featureEndsAt(r.endsAt?.toISOString() ?? null, created);
    out.push({
      byMember: true,
      cardSlug: "",
      itemId: r.itemId,
      url: `https://www.${r.host}/itm/${r.itemId}`,
      retailer: `ebay_${HOST_MARKET[r.host]?.toLowerCase() ?? "us"}`,
      title: r.title,
      priceCents: r.priceCents,
      currency: r.currency,
      condition: r.condition ?? "See listing",
      seller: r.seller ?? "eBay seller",
      location: r.location ?? "see listing",
      checked: r.checkedAt.toISOString().slice(0, 10),
      until: new Date(ends + 86_400_000).toISOString().slice(0, 10),
      format: r.format === "auction" ? "auction" : "buy_it_now",
      bids: r.bids ?? undefined,
      endsAt: new Date(ends).toISOString(),
      imageUrl: r.imageUrl ?? undefined,
    });
  }
  return out;
}

/** Every live member listing, for /featured. Six hours, purged after each sweep. */
// Throws on a database error (never cache an empty page for six hours); the
// page catches it and shows the hand-picked listings alone.
export const getLiveFeatured = unstable_cache(
  loadLive,
  ["featured-member-listings-v1"],
  { revalidate: 21600, tags: [FEATURED_TAG] },
);
