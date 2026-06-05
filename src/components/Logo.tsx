// RiftCompareAU "RC" monogram logo — white R, glowing green C, lightning slash
// on a dark gridded tile. Vector so it stays crisp at any size (favicon → hero).
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="RiftCompareAU logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="rcBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#16273f" />
          <stop offset="100%" stopColor="#0a1320" />
        </linearGradient>
        <linearGradient id="rcGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6af0a6" />
          <stop offset="100%" stopColor="#21b15e" />
        </linearGradient>
        <filter id="rcGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* tile */}
      <rect x="2" y="2" width="44" height="44" rx="11" fill="url(#rcBg)" stroke="#3b5772" strokeWidth="1" />
      {/* faint grid */}
      <g stroke="#6f97c4" strokeWidth="0.4" opacity="0.12">
        <path d="M14 3V45M24 3V45M34 3V45M3 14H45M3 24H45M3 34H45" />
      </g>

      {/* letters */}
      <text x="14.5" y="34" textAnchor="middle" fontFamily="'Arial Black', Arial, Helvetica, sans-serif" fontSize="27" fontWeight="900" fill="#ffffff">R</text>
      <text x="33.5" y="34" textAnchor="middle" fontFamily="'Arial Black', Arial, Helvetica, sans-serif" fontSize="27" fontWeight="900" fill="url(#rcGreen)" filter="url(#rcGlow)">C</text>

      {/* lightning slash */}
      <polygon points="27,5 20.5,24 24.5,24 20,43 31.5,21.5 26.5,21.5" fill="#eafff4" filter="url(#rcGlow)" />
    </svg>
  );
}
