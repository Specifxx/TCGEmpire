import Link from "next/link";
import { saleStrip } from "@/lib/holiday-strip";
import { STRIP_BOOT, StripClose } from "./StripClose";

// One line above every page's content in season (lib/holiday-strip.ts). Server-rendered from the render's date: a cached
// page can show yesterday's link for up to its revalidate window, which is why the switch to Cyber Monday falls on the
// Sunday, a day after Black Friday weekend's busiest day.
// Dismissible for 7 days (owner's UX review, 2026-11-24, P0 6), hidden before paint once closed (StripClose.tsx).
export function HolidayStrip({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  const s = saleStrip(today);
  if (!s) return null;
  return (
    <>
      <div className="relative border-b border-gold/20 bg-gold/10" data-holiday-strip={s.href.slice(1)}>
        <p className="container-app truncate py-1.5 pr-10 text-center text-xs sm:text-sm">
          <Link href={s.href} prefetch={false} className="hover:underline">
            <b>{s.name} Riftbound deals</b><span className="hidden sm:inline"> · sealed boxes against every store and eBay</span> · <span className="font-semibold text-gold">see the deals →</span>
          </Link>
        </p>
        <StripClose />
      </div>
      <script dangerouslySetInnerHTML={{ __html: STRIP_BOOT }} />
    </>
  );
}
