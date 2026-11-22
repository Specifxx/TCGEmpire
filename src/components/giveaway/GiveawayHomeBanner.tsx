import Link from "next/link";
import { CURRENT_GIVEAWAY as G, giveawayState } from "@/lib/giveaway";

// The home page's giveaway banner, right under the hero (owner, 2026-11-22; lib/giveaway-prompt.ts). Server-rendered from
// the render's date, so a cached home page can show it for up to a day after the close; the /giveaway page itself says
// when entries have closed.
export function GiveawayHomeBanner({ now = new Date() }: { now?: Date }) {
  if (giveawayState(G, now) !== "open") return null;
  return (
    <section aria-label="Giveaway" className="rounded-2xl border border-gold/30 bg-gold/10 p-4 sm:p-5" data-giveaway-banner>
      <Link href="/giveaway" prefetch={false} className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={G.imageUrl} alt="" aria-hidden="true" width={64} height={89} loading="lazy" className="h-[89px] w-16 flex-none rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gold">Free giveaway · worldwide · closes 14 Dec</span>
          <span className="mt-0.5 block text-lg font-bold leading-snug sm:text-xl">{G.title}</span>
          <span className="mt-0.5 block text-sm opacity-80">Free with a RiftCompare account. Watch any card&apos;s price for 3 entries, +1 for every friend you invite.</span>
        </span>
        <span className="hidden flex-none rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-black sm:inline">Enter free →</span>
      </Link>
      <Link href="/giveaway" prefetch={false} className="mt-3 block rounded-lg bg-gold px-4 py-2 text-center text-sm font-semibold text-black sm:hidden">
        Enter free →
      </Link>
    </section>
  );
}
