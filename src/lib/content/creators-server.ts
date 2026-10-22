// The /creators list with each creator's own edits applied (lib/content/creator-edit.ts).
// One small query per page regeneration; a database failure shows the static cards.
import { prisma } from "@/lib/db";
import { CREATORS, featuredCreators, type Creator } from "./creators";
import { applyEdit } from "./creator-edit";

export async function getCreators(): Promise<Creator[]> {
  const rows = await prisma.creatorProfileEdit
    .findMany({
      where: { editedAt: { not: null } },
      select: { slug: true, blurb: true, links: true, tipUrl: true, tags: true, region: true, editedAt: true },
    })
    .catch(() => []);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return featuredCreators(CREATORS.map((c) => applyEdit(c, bySlug.get(c.slug))));
}
