// The /creators list with each creator's own edits applied (lib/content/creator-edit.ts).
// Two small queries per page regeneration; a database failure shows the static cards.
import { prisma } from "@/lib/db";
import { CREATORS, attachCreatorCodes, featuredCreators, type ActiveCode, type Creator } from "./creators";
import { applyEdit } from "./creator-edit";

export async function getCreators(): Promise<Creator[]> {
  const rows = await prisma.creatorProfileEdit
    .findMany({
      where: { editedAt: { not: null } },
      select: { slug: true, blurb: true, links: true, tipUrl: true, tags: true, region: true, editedAt: true },
    })
    .catch(() => []);
  // Active creator codes (lib/content/creators.ts attachCreatorCodes): a handful
  // of rows, three columns, never the email. A failure shows the cards without them.
  const codes: ActiveCode[] = await prisma.affiliate
    .findMany({ where: { active: true }, select: { code: true, name: true, percentOff: true }, take: 500 })
    .catch(() => []);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return featuredCreators(attachCreatorCodes(CREATORS.map((c) => applyEdit(c, bySlug.get(c.slug))), codes));
}
