import { domainInfo, rarityInfo } from "@/lib/constants";

interface CardArtProps {
  name: string;
  domain: string;
  type: string;
  rarity: string;
  energyCost?: number | null;
  might?: number | null;
  collectorNumber?: string;
  artSeed?: number;
  isFoil?: boolean;
  className?: string;
}

// Deterministic pseudo-random generator from a numeric seed.
function seeded(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function initials(name: string): string {
  const core = name.split(",")[0].trim();
  const parts = core.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A fully self-contained SVG "card". Looks like a real TCG card without needing
// any external image assets — generated from the card's domain, rarity and seed.
export function CardArt({
  name,
  domain,
  type,
  rarity,
  energyCost,
  might,
  collectorNumber,
  artSeed = 1,
  isFoil = false,
  className,
}: CardArtProps) {
  const d = domainInfo(domain);
  const r = rarityInfo(rarity);
  const rand = seeded(artSeed + name.length * 7);
  const uid = `${artSeed}-${name.replace(/\W/g, "").slice(0, 6)}`;

  // Generate a few decorative crystals/shards for the art window.
  const shards = Array.from({ length: 6 }, (_, i) => {
    const cx = 30 + rand() * 190;
    const cy = 70 + rand() * 130;
    const size = 10 + rand() * 34;
    const rot = rand() * 360;
    const op = 0.12 + rand() * 0.28;
    return { cx, cy, size, rot, op, i };
  });

  return (
    <svg
      viewBox="0 0 250 350"
      className={className}
      role="img"
      aria-label={`${name} — ${rarity} ${type}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={d.color} />
          <stop offset="55%" stopColor={d.color2} />
          <stop offset="100%" stopColor="#0a0d13" />
        </linearGradient>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={d.color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={d.color} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`foil-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff0080" stopOpacity="0.35" />
          <stop offset="25%" stopColor="#ffea00" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#00ffd5" stopOpacity="0.32" />
          <stop offset="75%" stopColor="#7a5cff" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ff0080" stopOpacity="0.35" />
        </linearGradient>
        <clipPath id={`art-${uid}`}>
          <rect x="14" y="52" width="222" height="172" rx="8" />
        </clipPath>
      </defs>

      {/* Card frame */}
      <rect x="2" y="2" width="246" height="346" rx="16" fill="#0c0f16" />
      <rect
        x="2"
        y="2"
        width="246"
        height="346"
        rx="16"
        fill="none"
        stroke={r.color}
        strokeWidth="3"
      />
      <rect x="8" y="8" width="234" height="334" rx="12" fill={`url(#bg-${uid})`} />

      {/* Art window */}
      <rect x="14" y="52" width="222" height="172" rx="8" fill="#080b11" />
      <g clipPath={`url(#art-${uid})`}>
        <rect x="14" y="52" width="222" height="172" fill={`url(#glow-${uid})`} />
        {shards.map((s) => (
          <g key={s.i} transform={`translate(${s.cx} ${s.cy}) rotate(${s.rot})`}>
            <polygon
              points={`0,${-s.size} ${s.size * 0.5},0 0,${s.size} ${-s.size * 0.5},0`}
              fill={d.color}
              opacity={s.op}
              stroke={d.text}
              strokeWidth="0.5"
              strokeOpacity={s.op}
            />
          </g>
        ))}
        {/* Crest with initials */}
        <circle cx="125" cy="138" r="40" fill="#0a0d13" opacity="0.55" />
        <circle
          cx="125"
          cy="138"
          r="40"
          fill="none"
          stroke={d.text}
          strokeWidth="1.5"
          opacity="0.5"
        />
        <text
          x="125"
          y="138"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="34"
          fontWeight="800"
          fill={d.text}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {initials(name)}
        </text>
      </g>

      {/* Energy cost badge */}
      {energyCost != null && (
        <>
          <circle cx="30" cy="34" r="18" fill="#0a0d13" stroke={d.text} strokeWidth="2" />
          <text
            x="30"
            y="35"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="20"
            fontWeight="800"
            fill={d.text}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {energyCost}
          </text>
        </>
      )}

      {/* Name plate */}
      <text
        x={energyCost != null ? 54 : 18}
        y="35"
        fontSize="13"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {name.length > 22 ? name.slice(0, 21) + "…" : name}
      </text>

      {/* Type line */}
      <rect x="14" y="232" width="222" height="22" rx="5" fill="#0a0d13" opacity="0.7" />
      <text
        x="20"
        y="247"
        fontSize="11"
        fontWeight="600"
        fill={d.text}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {d.label} · {type}
      </text>
      <text
        x="232"
        y="247"
        textAnchor="end"
        fontSize="10"
        fontWeight="600"
        fill={r.color}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {rarity.toUpperCase()}
      </text>

      {/* Rules text area */}
      <rect x="14" y="260" width="222" height="74" rx="6" fill="#0a0d13" opacity="0.55" />

      {/* Collector number */}
      {collectorNumber && (
        <text
          x="20"
          y="326"
          fontSize="9"
          fill="#9aa0aa"
          fontFamily="ui-monospace, monospace"
        >
          {collectorNumber} · OGN
        </text>
      )}

      {/* Might badge */}
      {might != null && (
        <>
          <circle cx="222" cy="312" r="17" fill={d.color} stroke="#0a0d13" strokeWidth="2" />
          <text
            x="222"
            y="313"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="18"
            fontWeight="800"
            fill="#0a0d13"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {might}
          </text>
        </>
      )}

      {/* Foil overlay */}
      {isFoil && (
        <rect
          x="8"
          y="8"
          width="234"
          height="334"
          rx="12"
          fill={`url(#foil-${uid})`}
          style={{ mixBlendMode: "screen" }}
        />
      )}
    </svg>
  );
}
