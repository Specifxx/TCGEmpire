import Link from "next/link";
import { conditionInfo, domainInfo, rarityInfo } from "@/lib/constants";

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

// `href` makes the badge a link to the domain hub. Only pass it where the badge is
// NOT already inside another link (nested <a> is invalid) — e.g. the card page, not
// the card tiles (which are wrapped in a Link).
export function DomainBadge({ domain, href }: { domain: string; href?: string }) {
  const d = domainInfo(domain);
  const style = { backgroundColor: hexWithAlpha(d.color, 0.18), color: d.color };
  const inner = (
    <>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
      {d.label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="chip transition-opacity hover:opacity-80" style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <span className="chip" style={style}>
      {inner}
    </span>
  );
}

export function RarityBadge({ rarity }: { rarity: string }) {
  const r = rarityInfo(rarity);
  return (
    <span
      className="chip"
      style={{ backgroundColor: hexWithAlpha(r.color, 0.16), color: r.color }}
    >
      {r.label}
    </span>
  );
}

export function ConditionBadge({ condition }: { condition: string }) {
  const c = conditionInfo(condition);
  return (
    <span
      className="chip"
      style={{ backgroundColor: hexWithAlpha(c.color, 0.16), color: c.color }}
      title={c.full}
    >
      {c.label}
    </span>
  );
}

// Below: flat, single-tone chips — these used to be little linear-gradient
// swatches, but with ~20 card tiles per homepage viewport each is a repeated
// gradient element, and the label text already carries the meaning, so the
// gradient was pure decorative noise. Solid colour keeps the same identity
// with none of that cost (see the site's one kept gradient accent in
// BrandLogo.tsx).
// Shared by every badge below: at very small card widths (e.g. a compact
// CardTile ~130px wide) the normal `.chip` sizing (px-2.5 py-0.5 text-xs) is
// wider than the card art itself and wraps onto two lines. `compact` swaps in
// a smaller, single-line, width-capped treatment instead — the full label
// still lives in `title` (tooltip). Additive only: every existing caller that
// doesn't pass `compact` renders exactly as before.
const COMPACT_CHIP = "inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 truncate rounded px-1 py-0.5 text-[9px] font-bold uppercase leading-none";

export function VariantBadge({ variant, compact }: { variant?: string | null; compact?: boolean }) {
  if (!variant) return null;
  return (
    <span
      className={compact ? COMPACT_CHIP : "chip font-semibold uppercase"}
      style={{ backgroundColor: "#f5a524", color: "#1a1206" }}
      title={`Alternate art (${variant})`}
    >
      Alt {variant}
    </span>
  );
}

export function SignatureBadge({ show, compact }: { show?: boolean; compact?: boolean }) {
  if (!show) return null;
  return (
    <span
      className={compact ? COMPACT_CHIP : "chip font-semibold uppercase"}
      style={{ backgroundColor: "#b45309", color: "#fff" }}
      title="Signature (artist-autographed overnumbered print)"
    >
      ✍ Signature
    </span>
  );
}

export function OvernumberedBadge({ show, compact }: { show?: boolean; compact?: boolean }) {
  if (!show) return null;
  return (
    <span
      className={compact ? COMPACT_CHIP : "chip font-semibold uppercase"}
      style={{ backgroundColor: "#7c3aed", color: "#fff" }}
      title="Overnumbered (secret/signature print beyond the set count)"
    >
      ★ Overnumbered
    </span>
  );
}

export function CrystalRoseBadge({ show, compact }: { show?: boolean; compact?: boolean }) {
  if (!show) return null;
  return (
    <span
      className={compact ? COMPACT_CHIP : "chip font-semibold uppercase"}
      style={{ backgroundColor: "#c026d3", color: "#fff" }}
      title="Crystal Rose — Wild Rift crossover alt art"
    >
      ✿ Crystal Rose
    </span>
  );
}

export function PromoBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{ backgroundColor: "#0891b2", color: "#04222a" }}
      title="Promo printing"
    >
      ✦ Promo
    </span>
  );
}

export function FoilBadge() {
  return (
    <span
      className="chip font-semibold"
      style={{
        background:
          "linear-gradient(90deg,#ff0080,#ffea00,#00ffd5,#7a5cff,#ff0080)",
        color: "#0a0d13",
      }}
    >
      ✦ Foil
    </span>
  );
}
