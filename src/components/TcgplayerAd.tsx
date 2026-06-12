import { OutboundLink } from "./OutboundLink";

// TCGplayer display banners from the approved Impact contract. First-party
// placements (no ad network): the <a> is the Impact tracking link (commission
// on click-through purchases), the image is Impact's hosted creative, and the
// 1px image fires the impression beacon. Fixed dimensions = zero CLS.
//
// Creative selection is region-aware: US visitors see the seasonal campaign
// (Mayhem 2026); AU/NZ/UK see the "TCGplayer ships international" creative —
// the exact objection those visitors actually have.
const ACCOUNT = "7385758";
const PROGRAM = "21018";

type Variant = "rect" | "leaderboard" | "billboard" | "mobile" | "mobileRect";

// Ad ids from the Impact ads export (seasonal "us" creatives can be swapped
// here when campaigns rotate; the international ones are evergreen).
const ADS: Record<Variant, { us: string; intl: string; w: number; h: number }> = {
  rect: { us: "3913671", intl: "3841228", w: 336, h: 280 }, // large rectangle
  leaderboard: { us: "3904321", intl: "3841229", w: 728, h: 90 },
  billboard: { us: "3913669", intl: "3841226", w: 970, h: 90 }, // large leaderboard
  mobile: { us: "3913670", intl: "3841227", w: 320, h: 100 }, // large mobile banner
  mobileRect: { us: "3904323", intl: "3841225", w: 300, h: 250 }, // medium rectangle
};

const click = (id: string) => `https://partner.tcgplayer.com/c/${ACCOUNT}/${id}/${PROGRAM}`;
const creative = (id: string) => `https://a.impactradius-go.com/display-ad/${PROGRAM}-${id}`;
const impression = (id: string) => `https://partner.tcgplayer.com/i/${ACCOUNT}/${id}/${PROGRAM}`;

function Banner({ id, w, h, country }: { id: string; w: number; h: number; country: string }) {
  return (
    <span className="relative inline-block" style={{ width: w, height: h }}>
      <OutboundLink href={click(id)} retailer="tcgplayer_banner" country={country} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creative(id)}
          alt="TCGplayer — shop singles and sealed"
          width={w}
          height={h}
          loading="lazy"
          className="rounded-lg border border-ink-700"
        />
      </OutboundLink>
      <span className="absolute left-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        Ad
      </span>
      {/* Impact impression beacon. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={impression(id)} alt="" width={0} height={0} loading="lazy" className="absolute h-0 w-0" />
    </span>
  );
}

// Responsive placement: `size` for larger screens, a mobile unit below `sm`.
// `mobile="rect"` swaps the slim 320x100 banner for the 300x250 rectangle — a
// far better in-content unit on phones. The billboard steps down to the 728
// leaderboard between sm and lg so it never overflows. Hidden variants' lazy
// images never intersect the viewport, so they aren't fetched (no double
// impressions).
export function TcgplayerAd({
  size = "rect",
  mobile = "banner",
  country,
  className,
}: {
  size?: "rect" | "leaderboard" | "billboard";
  mobile?: "banner" | "rect";
  country: string;
  className?: string;
}) {
  const intl = country !== "US";
  const ad = (v: Variant) => ({ id: intl ? ADS[v].intl : ADS[v].us, w: ADS[v].w, h: ADS[v].h });
  const desk = ad(size);
  const mid = ad("leaderboard");
  const mob = ad(mobile === "rect" ? "mobileRect" : "mobile");
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      {size === "billboard" ? (
        <>
          <span className="hidden lg:inline-block">
            <Banner {...desk} country={country} />
          </span>
          <span className="hidden sm:inline-block lg:hidden">
            <Banner {...mid} country={country} />
          </span>
        </>
      ) : (
        <span className="hidden sm:inline-block">
          <Banner {...desk} country={country} />
        </span>
      )}
      <span className="sm:hidden">
        <Banner {...mob} country={country} />
      </span>
    </div>
  );
}
