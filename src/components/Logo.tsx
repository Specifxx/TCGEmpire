// Dice logo for RiftCompareAU — a green die with gold pips (AU colours).
// (Generated vector. Swap in an AI-generated PNG later by replacing this SVG.)
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="RiftCompareAU dice logo">
      <defs>
        <linearGradient id="dieFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d17e" />
          <stop offset="55%" stopColor="#16a34a" />
          <stop offset="100%" stopColor="#0c6b32" />
        </linearGradient>
        <linearGradient id="dieEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7c948" />
          <stop offset="100%" stopColor="#d99e0b" />
        </linearGradient>
      </defs>
      {/* die body */}
      <rect x="4" y="4" width="40" height="40" rx="11" fill="url(#dieFace)" stroke="url(#dieEdge)" strokeWidth="2.5" />
      {/* subtle top sheen */}
      <rect x="8" y="8" width="32" height="14" rx="7" fill="#ffffff" opacity="0.10" />
      {/* 5 pips (gold) */}
      <g fill="#f7c948">
        <circle cx="15" cy="15" r="3.4" />
        <circle cx="33" cy="15" r="3.4" />
        <circle cx="24" cy="24" r="3.4" />
        <circle cx="15" cy="33" r="3.4" />
        <circle cx="33" cy="33" r="3.4" />
      </g>
    </svg>
  );
}
