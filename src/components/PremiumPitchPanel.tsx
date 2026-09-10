// THE PREMIUM PITCH, AS THE OWNER DESIGNED IT (2026-09-10). Replaces the
// two-bar SVG that briefly stood here, which in turn replaced a wall of text.
// The owner supplied a finished comp: character art bleeding behind a dark
// scrim, the RiftCompare wordmark and a gold PREMIUM badge, "GET AN / UNFAIR
// EDGE / FOR BUYING AND SELLING" as the headline, four icon rows, then the
// price and the real sign-in buttons.
//
// BUILT AS REAL MARKUP, NOT THE COMP ITSELF. Shipping the comp as one flat
// image was the obvious shortcut and is wrong here for a reason that is easy
// to measure: the comp is 1145px wide and this card renders at 384px, so every
// baked-in word would land at about a third of its designed size — the body
// copy would be roughly 5px tall and simply unreadable. Real text also scales
// with the viewport, survives a screen reader, can be translated, and lets the
// price come from the shared helpers instead of being frozen into a picture on
// the day it was exported. Only the artwork is a raster (public/premium/
// premium-pitch.webp, 36KB, cropped out of the comp — the left-hand column of
// the comp had the UI text baked over it, so the crop starts to its right).
//
// EVERY FEATURE ROW IS A REAL PREMIUM-ONLY ENTITLEMENT. The comp's own rows
// read "Advanced filters — find the exact cards, sets and rarities you want"
// and "See the best prices across stores instantly", and both of those are the
// FREE tier: TierComparisonTable's TIER_COMPARISON has "Compare prices across
// every store + eBay" and "Full card database, search & browse" as ticks in
// the anon column. Selling those as Premium would be the one thing this repo
// consistently refuses to do, so the rows below keep the comp's shape, icons
// and rhythm but name things that are genuinely behind the paywall. Each maps
// to a TIER_COMPARISON row that is Premium-only or Premium-full-list.
//
// Presentational only — no hooks, no props beyond layout, no fetch — so it
// renders inside the server tree or a client nudge alike.

type Feature = { title: string; body: string; icon: React.ReactNode };

// 24x24, 1.75 stroke, rounded joins — the icon system HomeIcons.tsx sets out.
const iconBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const FEATURES: Feature[] = [
  {
    // TIER_COMPARISON: Deal Finder — "Top pick" free, "Full list" Premium.
    title: "Every deal, ranked",
    body: "The full Deal Finder list, not just the top pick.",
    icon: (
      <svg {...iconBase}>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    ),
  },
  {
    // TIER_COMPARISON: Value Finder / Bulk Pricer / Best Basket — Premium only.
    title: "The pro screeners",
    body: "Value Finder, Bulk Pricer and Best Basket.",
    icon: (
      <svg {...iconBase}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11" />
      </svg>
    ),
  },
  {
    // TIER_COMPARISON: Rising Cards full list + Demand Finder — Premium only.
    title: "Market insights",
    body: "Rising Cards and Demand Finder, in full.",
    icon: (
      <svg {...iconBase}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    // Not a feature claim at all, so nothing to verify — and the one row from
    // the comp that needed no rewording.
    title: "Support RiftCompare",
    body: "Help keep price comparison free for everyone.",
    icon: (
      <svg {...iconBase}>
        <path d="M12 3l4 5-4 13-4-13 4-5zM8 8h8" />
      </svg>
    ),
  },
];

export function PremiumPitchPanel({
  badge,
  showFeatures = true,
}: {
  // The gold PREMIUM badge is passed in rather than declared here: both callers
  // are pinned by tests that read their OWN source for the badge's classes.
  badge?: React.ReactNode;
  // The signed-in nudge sets this false — it already carries a per-route
  // contextual pitch naming one specific tool, which beats a generic four-row
  // list, and it has no room for both.
  showFeatures?: boolean;
}) {
  return (
    <div className="relative overflow-hidden">
      {/* Artwork, cropped from the owner's comp, anchored to the RIGHT rather
          than stretched across the whole panel. At the comp's 1145px the
          character and the copy sit side by side with room to spare; at 384px
          they would land on top of each other, and a scrim dark enough to keep
          the headline legible turns her face into a smudge. Confining the art
          to the right ~64% and fading its left edge into the card keeps both
          readable — the copy gets clean ink, the character stays a character.
          Decorative: every claim it carries is in the real text beside it, so
          an empty alt is correct (scripts/check-images.ts requires the
          attribute to be present and allows it to be empty). */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[64%]">
        <img
          src="/premium/premium-pitch.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[38%_26%]"
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #0e1116 0%, rgba(14,17,22,0.82) 26%, rgba(14,17,22,0.30) 62%, rgba(14,17,22,0.12) 100%)",
          }}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-transparent" />

      {/* A soft shadow on every word in here, rather than a heavier scrim. The
          feature rows run a little way over the character's face at this width,
          and darkening the whole art to fix that costs more than it buys. */}
      <div className="relative px-4 pb-3 pt-3.5" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-extrabold italic tracking-tight text-white">
            Rift<span className="text-brand-400">compare</span>
          </span>
        </div>
        {badge ? <div className="mt-1.5">{badge}</div> : null}
        <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Buy smarter. Sell higher.
        </p>

        <h2 className="mt-2 font-display text-[22px] font-extrabold uppercase italic leading-[0.95] tracking-tight text-white">
          Get an
          <br />
          <span className="text-[26px] text-brand-400">Unfair edge</span>
          <br />
          <span className="text-[13px] text-slate-300">for buying and selling</span>
        </h2>

        {showFeatures && (
          <ul className="mt-3 space-y-2">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                // Rows 3 and 4 stand down on a short viewport so the sign-in
                // buttons stay above the fold on a small phone. The card also
                // caps its own height and scrolls (see the caller), but needing
                // to scroll to reach the CTA is a worse card than a shorter one.
                className={`flex items-start gap-2.5 ${i >= 2 ? "hidden [@media(min-height:700px)]:flex" : "flex"}`}
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                    i === 0 ? "border-gold/60 bg-gold/10 text-gold" : "border-ink-700 bg-ink-900/70 text-slate-300"
                  }`}
                >
                  <span className="block h-3.5 w-3.5">{f.icon}</span>
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[10.5px] font-extrabold uppercase tracking-wide ${
                      i === 0 ? "text-gold" : "text-white"
                    }`}
                  >
                    {f.title}
                  </span>
                  <span className="block text-[10.5px] leading-snug text-slate-400">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
