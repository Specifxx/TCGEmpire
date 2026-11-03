import { seasonMarkupLive } from "@/lib/season";

// Christmas set dressing for the hero (owner, 2026-11-01: "Christmas trees,
// maybe like a Santa hat … stockings … candy canes"): a strand of twinkling
// lights along the top, and trees, presents and a candy cane in the bottom
// corners where Halloween had its jack-o'-lanterns. The snow itself falls in
// the embers canvas (RiftEmbers), which turns its sparks into flakes.
//
// Pure decoration, aria-hidden, in the hero's background layer under the
// content. Same gating as HalloweenDecor: in the HTML only around the season,
// shown only while <html> carries data-season="christmas" (globals.css).
export function ChristmasDecor() {
  if (!seasonMarkupLive("christmas")) return null;
  return (
    <div className="rb-xmas xmas-only" aria-hidden="true">
      <span className="xmas-lights rb-xmas-lights" />
      <span className="rb-xmas-corner rb-xmas-corner-l">
        <span className="xmas-art xmas-tree rb-xmas-tree" />
        <span className="xmas-art xmas-gift rb-xmas-gift" />
      </span>
      <span className="rb-xmas-corner rb-xmas-corner-r">
        <span className="xmas-art xmas-cane rb-xmas-cane" />
        <span className="xmas-art xmas-tree rb-xmas-tree rb-xmas-tree-sm" />
      </span>
    </div>
  );
}
