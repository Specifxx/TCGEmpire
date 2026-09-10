// The one visual in the Premium pitch — replaces the wall of text (a sentence
// plus six tool chips) that both corner nudges used to lead with. Owner brief,
// 2026-09-10: "it should be a graphic... one clear image that is advertising
// why RiftCompare Premium is benefiting my life... it'll be eye catching
// rather than text."
//
// WHY INLINE SVG, NOT AN IMAGE FILE. scripts/check-images.ts scans public/ for
// raster only and holds it to a 150KB budget, and every raster in this repo
// ships as a .png + .webp + .avif + narrow renditions plus an image-manifest
// entry (see Picture.tsx). There are zero .svg files in public/. Inline SVG
// costs no HTTP request, ships inside the already-lazy nudge bundles, scales
// crisply at any width, and is the established house idiom — see Logo.tsx
// (hard-coded hex stops, rc-prefixed gradient ids, role="img" + aria-label)
// and PriceChart.tsx's Sparkline.
//
// WHY THE BARS CARRY NO NUMBERS, DELIBERATELY. This is an illustration, not a
// measurement, and this codebase fails builds over invented figures — three
// separate tests pin "no fake scarcity" across the Premium surfaces. Putting an
// axis or a percentage on these bars would turn a metaphor into a data claim
// nobody could source. Instead the two bars are labelled with a REAL, already-
// published product difference: the free tier shows only the top pick, Premium
// shows the full ranked list. That exact claim is on /premium today — the
// FEATURES entries for Rising Cards, Rising Sealed and Deal Finder each read
// "Free shows only the top pick". So the competitive framing the brief asked
// for lands, and every word on the graphic is literally true.
//
// Presentational only (no hooks, no props, no data fetch), so it renders from a
// server or client component alike, same rule as AnnualPriceBlock.

export function PremiumEdgeGraphic({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 106"
      className={`h-auto w-full ${className}`}
      role="img"
      aria-label="Premium ranks every deal for you; the free tier shows only the single top pick."
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Gold, brightening toward the leading edge so the full-length bar reads
            as the "won" one at a glance. Ids are rcEdge-prefixed — CardArt.tsx
            documents the collision trap when a graphic renders more than once. */}
        <linearGradient id="rcEdgeGold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a8853f" />
          <stop offset="55%" stopColor="#caa85a" />
          <stop offset="100%" stopColor="#eddaa8" />
        </linearGradient>
      </defs>

      {/* ── You, on Premium ─────────────────────────────────────────────── */}
      <text x="10" y="12" fontSize="10" fontWeight="800" letterSpacing="1.2" fill="#ffffff" fontFamily="system-ui, sans-serif">
        YOU
      </text>
      <rect x="10" y="18" width="278" height="16" rx="3" fill="url(#rcEdgeGold)" />
      <text x="298" y="31" fontSize="13" fill="#caa85a" textAnchor="middle" fontFamily="system-ui, sans-serif">
        ✦
      </text>
      <text x="10" y="49" fontSize="10.5" fill="#caa85a" fontFamily="system-ui, sans-serif">
        every deal, ranked
      </text>

      {/* ── Everyone else, on free ──────────────────────────────────────── */}
      <text x="10" y="76" fontSize="10" fontWeight="800" letterSpacing="1.2" fill="#8593a6" fontFamily="system-ui, sans-serif">
        EVERYONE ELSE
      </text>
      <rect x="10" y="82" width="58" height="16" rx="3" fill="#2b3342" stroke="#3d4657" strokeWidth="1" />
      <text x="78" y="94" fontSize="10.5" fill="#8593a6" fontFamily="system-ui, sans-serif">
        top pick only
      </text>
    </svg>
  );
}
