import { ImageResponse } from "next/og";
import { PREMIUM_ANNUAL_AMOUNT, PREMIUM_PRICE_AMOUNT, premiumEffectiveMonthly } from "@/lib/site";
import { PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS, premiumTrialEnabled } from "@/lib/premium";

// /premium's share card (2026-10-23, the conversion redesign). Every figure is
// read from the same display constants as the page (lib/site.ts, lib/premium.ts),
// so a price change moves the card too. Plain divs, no font or image fetches,
// like riftle/opengraph-image.tsx.
export const alt = "RiftCompare Premium: the lowest delivered price for every Riftbound card you buy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const usd = (a: string) => (a.startsWith("$") ? `US${a}` : a);

export default function OgImage() {
  const freeTrial = premiumTrialEnabled() && PREMIUM_TRIAL_FEE_CENTS === 0 && PREMIUM_TRIAL_DAYS > 0;
  const effective = premiumEffectiveMonthly();
  const price = effective
    ? `${usd(PREMIUM_PRICE_AMOUNT)}/mo or ${usd(PREMIUM_ANNUAL_AMOUNT)}/yr (${usd(effective)}/mo)`
    : `${usd(PREMIUM_PRICE_AMOUNT)}/mo`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "70px 80px",
          background: "linear-gradient(135deg, #04131c 0%, #062436 55%, #013951 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#e5b94b", letterSpacing: 4 }}>RIFTCOMPARE PREMIUM</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 68, fontWeight: 800, color: "#ffffff", lineHeight: 1.1, maxWidth: 1000 }}>
          The lowest delivered price for every Riftbound card you buy
        </div>
        <div style={{ display: "flex", marginTop: 30, fontSize: 32, color: "#cbd5e1" }}>
          Deck pricing · price alerts · every below-market deal · no ads
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 34, fontWeight: 800, color: "#34d17e" }}>
          {freeTrial ? `${PREMIUM_TRIAL_DAYS} days free, then ${price}` : price}
        </div>
      </div>
    ),
    size
  );
}
