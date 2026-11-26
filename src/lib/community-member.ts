import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { premiumSiteForOrigin, verifyPremiumSession } from "@/lib/sister-premium";

// Who is contributing (lib/contributions.ts): a sister site's signed-in member (their premium-session token, checked against the
// request's exact origin) or a RiftCompare session. Per request, uncached, select-limited, from /api/* routes only.

export interface CommunityMember {
  id: string;
  handle: string | null;
  /** the site key the contribution is made on ("rift" for RiftCompare itself) */
  site: string;
}

export async function communityMember(req: Request, token: unknown): Promise<CommunityMember | null> {
  const origin = req.headers.get("origin");
  const sister = premiumSiteForOrigin(origin);
  if (sister) {
    const email = await verifyPremiumSession(token, sister);
    if (!email) return null;
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true, handle: true } });
    return u ? { id: u.id, handle: u.handle, site: sister.key } : null;
  }
  // A RiftCompare session counts only from RiftCompare's own pages: never a cookie sent along by another site's request.
  if (origin && !/^https:\/\/(www\.)?riftcompare\.com$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) return null;
  const me = await getCurrentUser();
  if (!me) return null;
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { id: true, handle: true } });
  return u ? { id: u.id, handle: u.handle, site: "rift" } : null;
}
