import { getSetBoxPrices } from "@/lib/radiance-cta";
import { isBeforeLegacyRelease, LEGACY_SET_CODE } from "@/lib/sets/legacy";
import { LegacyPreorderCtaView } from "./LegacyPreorderCtaView";

// "Legacy booster box pre-orders from US$159.99 · compare every store →", the
// block that routes Legacy reading traffic to /legacy-preorders: near the top of
// every legacy-tagged post and again after its first section, the way
// RadiancePreorderCta did for Radiance's season (DECISIONS.md, "Legacy season
// starts", 2026-11-01). Renders nothing from release day; Legacy's posts then
// link its set page in their own copy.
export async function LegacyPreorderCta({ placement }: { placement: "top" | "section" }) {
  if (!isBeforeLegacyRelease()) return null;
  const prices = await getSetBoxPrices(LEGACY_SET_CODE).catch(() => ({}));
  return <LegacyPreorderCtaView prices={prices} placement={placement} />;
}
