// On-demand ISR purge for a SINGLE card page, so a marketplace listing going
// live/changing/selling out shows up on /card/<slug> without waiting out the
// page's 24h `revalidate` fallback (see src/app/card/[id]/page.tsx). Cheap by
// design — unlike revalidateContent() (which purges every /card/* page for the
// twice-daily price import), this only touches the one page that changed, so
// listing churn can't turn into a revalidation storm.
//
// Must run inside a route handler / server action (request scope), same rule as
// revalidateContent().
import { revalidatePath } from "next/cache";
import { prisma } from "./db";

export async function revalidateCardPage(cardId: string): Promise<void> {
  try {
    const card = await prisma.card.findUnique({ where: { id: cardId }, select: { slug: true } });
    if (!card) return;
    revalidatePath(`/card/${card.slug ?? cardId}`);
  } catch {
    // Never let a revalidation hiccup fail the caller's actual write.
  }
}
