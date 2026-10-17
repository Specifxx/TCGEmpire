import type { Badge } from "@/lib/coins";

// A profile badge (Riftcoins, 2026-10-17; DECISIONS.md, "Riftcoins"): a
// hexagonal crest in the domain's colour with its glyph. Pure SVG, no state,
// so the server-rendered /profile and the client /coins page draw it alike.

const GLYPH: Record<string, string> = {
  // Simple strokes on a 24-unit grid, centred at 12,12.
  fury: "M13 3 6 13h5l-1 8 8-11h-5l1-7Z",
  calm: "M4 14c3-1 5-4 8-4s5 3 8 4M4 18c3-1 5-4 8-4s5 3 8 4M12 4a3 3 0 0 1 0 6 3 3 0 0 1 0-6Z",
  mind: "M12 4a6 6 0 0 0-3 11v3h6v-3a6 6 0 0 0-3-11ZM10 21h4",
  body: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z",
  chaos: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  order: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3Z",
};

export function RiftBadge({ badge, size = 56, locked = false, className = "" }: { badge: Badge; size?: number; locked?: boolean; className?: string }) {
  const id = `rb-${badge.id}`;
  const c = locked ? "#3a4152" : badge.color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={locked ? "A badge you haven't won yet" : `${badge.name} badge`}
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity={locked ? 0.5 : 0.95} />
          <stop offset="1" stopColor={c} stopOpacity={locked ? 0.2 : 0.45} />
        </linearGradient>
      </defs>
      {/* Outer rim, then the face. */}
      <path d="M32 2 58 17v30L32 62 6 47V17L32 2Z" fill="#0b0e16" stroke={c} strokeWidth="3" />
      <path d="M32 9 52 20.5v23L32 55 12 43.5v-23L32 9Z" fill={`url(#${id}-g)`} />
      {locked ? (
        <text x="32" y="40" textAnchor="middle" fontSize="20" fontWeight="900" fill="#ffffff" fillOpacity="0.35">
          ?
        </text>
      ) : (
        <g transform="translate(20 20)" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={GLYPH[badge.id] ?? GLYPH.order} />
        </g>
      )}
    </svg>
  );
}
