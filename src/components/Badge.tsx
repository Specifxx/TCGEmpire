import type { CSSProperties } from "react";
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
//
// The data-coloured chips below (domain, rarity, condition) pass their hex as
// --data-ink, not `color`, so the light theme can darken it (globals.css
// .data-ink): the dark-tuned hexes in lib/constants.ts read 1.8-3.3:1 on the
// light page (Showcase #f5a524 1.82:1, 2026-09-23). Dark renders the raw hex,
// pixel-identical. The dot swatch is a fill, not text, and keeps the raw hex.
export function DomainBadge({ domain, href }: { domain: string; href?: string }) {
  const d = domainInfo(domain);
  const style = { backgroundColor: hexWithAlpha(d.color, 0.18), "--data-ink": d.color } as CSSProperties;
  const inner = (
    <>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
      {d.label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="chip data-ink transition-opacity hover:opacity-80" style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <span className="chip data-ink" style={style}>
      {inner}
    </span>
  );
}

export function RarityBadge({ rarity }: { rarity: string }) {
  const r = rarityInfo(rarity);
  return (
    <span
      className="chip data-ink"
      style={{ backgroundColor: hexWithAlpha(r.color, 0.16), "--data-ink": r.color } as CSSProperties}
    >
      {r.label}
    </span>
  );
}

export function ConditionBadge({ condition }: { condition: string }) {
  const c = conditionInfo(condition);
  return (
    <span
      className="chip data-ink"
      style={{ backgroundColor: hexWithAlpha(c.color, 0.16), "--data-ink": c.color } as CSSProperties}
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
export function VariantBadge({ variant }: { variant?: string | null }) {
  if (!variant) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{ backgroundColor: "#f5a524", color: "#1a1206" }}
      title={`Alternate art (${variant})`}
    >
      Alt {variant}
    </span>
  );
}

export function SignatureBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{ backgroundColor: "#b45309", color: "#fff" }}
      title="Signature (artist-autographed overnumbered print)"
    >
      ✍ Signature
    </span>
  );
}

// A set's single Ultimate-rarity card (constants.ts isUltimate) — shown INSTEAD
// of the Overnumbered badge its number would otherwise earn. Colour matches
// ULTIMATE_RARITY so the tile chip and the rarity chip agree.
export function UltimateBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{ backgroundColor: "#dc2626", color: "#fff" }}
      title="Ultimate — the set's rarest card, pulled at the same odds as a Signature"
    >
      ◆ Ultimate
    </span>
  );
}

export function OvernumberedBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{ backgroundColor: "#7c3aed", color: "#fff" }}
      title="Overnumbered (secret/signature print beyond the set count)"
    >
      ★ Overnumbered
    </span>
  );
}

export function CrystalRoseBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      className="chip font-semibold uppercase"
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
