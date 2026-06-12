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

type Variant = "rect" | "leaderboard" | "mobile";

// Ad ids from the Impact ads export (seasonal "us" creatives can be swapped
// here when campaigns rotate; the international ones are evergreen).
const ADS: Record<Variant, { us: string; intl: string; w: number; h: number }> = {
  rect: { us: "3913671", intl: "3841228", w: 336, h: 280 }, // large rectangle
  leaderboard: { us: "3904321", intl: "3841229", w: 728, h: 90 },
  mobile: { us: "3913670", intl: "3841227", w: 320, h: 100 }, // large mobile banner
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

// Responsive placement: `size` for sm+ screens, the mobile banner below that.
// Hidden variant's lazy image never intersects the viewport, so it isn't
// fetched (no double impressions).
export function TcgplayerAd({ size = "rect", country, className }: { size?: "rect" | "leaderboard"; country: string; className?: string }) {
  const intl = country !== "US";
  const pick = (v: Variant) => (intl ? ADS[v].intl : ADS[v].us);
  const big = ADS[size];
  const mob = ADS.mobile;
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      <span className="hidden sm:inline-block">
        <Banner id={pick(size)} w={big.w} h={big.h} country={country} />
      </span>
      <span className="sm:hidden">
        <Banner id={pick("mobile")} w={mob.w} h={mob.h} country={country} />
      </span>
    </div>
  );
}
