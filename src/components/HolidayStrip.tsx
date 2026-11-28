import Link from "next/link";
import { BfModeBar } from "@/components/BfModeBar";
import { TcgSalePopup } from "@/components/TcgSalePopup";
import { affiliateUrl } from "@/lib/affiliate";
import { bfModeOn, bfPhase } from "@/lib/bf-mode";
import { saleStrip } from "@/lib/holiday-strip";
import { TCGPLAYER_STANDING, type OfferEvent } from "@/lib/offer-calendar";
import { STRIP_BOOT, StripClose } from "./StripClose";

// One line above every page's content in season (lib/holiday-strip.ts). Server-rendered from the render's date: a cached
// page can show yesterday's link for up to its revalidate window, which is why the switch to Cyber Monday falls on the
// Sunday, a day after Black Friday weekend's busiest day.
// Dismissible for 7 days (owner's UX review, 2026-11-24, P0 6), hidden before paint once closed (StripClose.tsx).
// For Black Friday itself (lib/bf-mode.ts, owner 2026-11-27) the line becomes the bold Black Friday bar, which falls back to it.
/** Riftbound's own dated events for the offer bar: Legacy previews from 13 Dec, then Pre-Rift (22 Jan) and release (29 Jan). */
const RIFT_EVENTS: OfferEvent[] = [
  {
    from: "2026-12-13T00:00:00Z",
    to: "2027-01-22T00:00:00Z",
    label: "Legacy previews",
    title: "Legacy pre-orders: box prices across every store",
    href: "/legacy-preorders",
  },
  {
    from: "2027-01-22T00:00:00Z",
    to: "2027-02-12T00:00:00Z",
    label: "Legacy is here",
    title: "Legacy: Pre-Rift from 22 Jan, release 29 Jan. Box prices across every store",
    href: "/sets/legacy",
  },
];

export function HolidayStrip({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  const s = saleStrip(today);
  const strip = s ? (
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
  ) : null;
  const now = Date.now();
  const on = bfModeOn(now);
  // After the sale the bar and the card keep running with the offer calendar (lib/offer-calendar.ts, owner 2026-11-28).
  const tcgplayerSealed = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?productLineName=riftbound-league-of-legends-trading-card-game&ProductTypeName=Sealed+Products";
  return (
    <>
    <BfModeBar
      on={on} phase={bfPhase(now)} now={now}
      evergreen={{
        title: "Riftbound sealed deals",
        line: "booster boxes and displays against every store and eBay today",
        href: "/sealed",
        hrefs: { afterChristmas: "/boxing-day", newYear: "/january-sales" },
        events: RIFT_EVENTS,
        ad: (
          <a href={affiliateUrl(tcgplayerSealed, "tcgplayer", "/offer-bar")} rel="sponsored nofollow noopener noreferrer" target="_blank" className="underline underline-offset-2">
            <span style={{ color: "#fff" }}>{TCGPLAYER_STANDING.short}</span> · Ad
          </a>
        ),
      }}
      href="/black-friday"
      title="Riftbound sealed deals"
      line="booster boxes and displays against every store and eBay today"
      ad={
        <a
          href={affiliateUrl("https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?ProductTypeName=Sealed+Products", "tcgplayer", "/bf-mode")}
          rel="sponsored nofollow noopener noreferrer"
          target="_blank"
          className="underline underline-offset-2"
        >
          <span style={{ color: "#fff" }}>TCGplayer sale: 10% store credit on everything</span> · Ad
        </a>
      }
    >
      {strip}
    </BfModeBar>
    {/* TCGplayer's sale card (owner, 2026-11-27): once a visit, never while typing, closes for good (TcgSalePopup.tsx). */}
    <TcgSalePopup slotKey="rc_prompt_slot" dealsHref="/black-friday" offerHref="/sealed">
      <a href={affiliateUrl("https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?productLineName=riftbound-league-of-legends-trading-card-game&q=booster+box&ProductTypeName=Sealed+Products", "tcgplayer", "/bf-popup")} rel="sponsored nofollow noopener noreferrer" target="_blank">Booster boxes</a>
      <a href={affiliateUrl("https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?productLineName=riftbound-league-of-legends-trading-card-game&ProductTypeName=Sealed+Products", "tcgplayer", "/bf-popup")} rel="sponsored nofollow noopener noreferrer" target="_blank">All sealed</a>
      <a href={affiliateUrl("https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?productLineName=riftbound-league-of-legends-trading-card-game&ProductTypeName=Cards", "tcgplayer", "/bf-popup")} rel="sponsored nofollow noopener noreferrer" target="_blank">Singles</a>
    </TcgSalePopup>
    </>
  );
}
