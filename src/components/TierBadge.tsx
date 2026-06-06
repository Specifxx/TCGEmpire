const TIER_COLORS: Record<string, { bg: string; fg: string }> = {
  // Numeric tiers (riftDecks.com metashare tiers).
  "1": { bg: "linear-gradient(90deg,#f43f5e,#fb7185)", fg: "#fff" },
  "2": { bg: "linear-gradient(90deg,#f59e0b,#fbbf24)", fg: "#1a1206" },
  "3": { bg: "linear-gradient(90deg,#3b82f6,#60a5fa)", fg: "#fff" },
  "4": { bg: "linear-gradient(90deg,#64748b,#94a3b8)", fg: "#fff" },
  // Legacy letter tiers.
  S: { bg: "linear-gradient(90deg,#f43f5e,#fb7185)", fg: "#fff" },
  A: { bg: "linear-gradient(90deg,#f59e0b,#fbbf24)", fg: "#1a1206" },
  B: { bg: "linear-gradient(90deg,#3b82f6,#60a5fa)", fg: "#fff" },
  C: { bg: "linear-gradient(90deg,#64748b,#94a3b8)", fg: "#fff" },
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
