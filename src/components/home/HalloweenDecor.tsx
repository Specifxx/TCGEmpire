import { seasonMarkupLive } from "@/lib/season";

// Halloween set dressing for the hero (owner, 2026-10-16: "the pumpkins, the
// bats, the cobwebs, the spiders"): cobwebs in the two top corners and candlelit
// jack-o'-lanterns in the two bottom ones. The bats and the spiders on their
// threads move, so they live in the embers canvas (RiftEmbers).
//
// Pure decoration, aria-hidden, in the hero's background layer under the
// content. The art is two cached files (public/brand/cobweb.svg, used as a mask
// so the theme can tint it, and public/brand/pumpkin.svg). Same gating as
// NocturneComing: in the HTML only around the season, shown only while <html>
// carries data-season="halloween" (globals.css .rb-decor).
export function HalloweenDecor() {
  if (!seasonMarkupLive("halloween")) return null;
  return (
    <div className="rb-decor" aria-hidden="true">
      <span className="rb-web rb-web-l" />
      <span className="rb-web rb-web-r" />
      <span className="rb-pumpkins rb-pumpkins-l">
        <span className="rb-pumpkin" />
        <span className="rb-pumpkin rb-pumpkin-sm" />
      </span>
      <span className="rb-pumpkins rb-pumpkins-r">
        <span className="rb-pumpkin rb-pumpkin-sm" />
        <span className="rb-pumpkin" />
      </span>
    </div>
  );
}
