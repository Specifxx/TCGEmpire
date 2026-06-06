// Flat, low-saturation chips (no bright gradients) — a colour-coded ring + tinted
// text reads clean rather than "gamer/AI".
const TIER_COLORS: Record<string, { bg: string; fg: string }> = {
  "1": { bg: "rgba(225,90,95,0.12)", fg: "#e3989b" },
  "2": { bg: "rgba(203,171,99,0.12)", fg: "#cbab63" },
  "3": { bg: "rgba(120,160,210,0.12)", fg: "#9fb8d6" },
  "4": { bg: "rgba(148,163,184,0.12)", fg: "#9aa6b8" },
  // Legacy letter tiers.
  S: { bg: "rgba(225,90,95,0.12)", fg: "#e3989b" },
  A: { bg: "rgba(203,171,99,0.12)", fg: "#cbab63" },
  B: { bg: "rgba(120,160,210,0.12)", fg: "#9fb8d6" },
  C: { bg: "rgba(148,163,184,0.12)", fg: "#9aa6b8" },
};

export function TierBadge({ tier }: { tier: string }) {
  const c = TIER_COLORS[tier.toUpperCase()] ?? TIER_COLORS.C;
  return (
    <span
      className="chip font-extrabold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
      title={`Tier ${tier.toUpperCase()}`}
    >
      Tier {tier.toUpperCase()}
    </span>
  );
}
