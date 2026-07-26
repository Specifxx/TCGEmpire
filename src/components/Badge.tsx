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

export function VariantBadge({ variant }: { variant?: string | null }) {
  if (!variant) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{
        background: "linear-gradient(90deg,#f5a524,#f7c948)",
        color: "#1a1206",
      }}
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
      style={{ background: "linear-gradient(90deg,#f59e0b,#b45309)", color: "#fff" }}
      title="Signature (artist-autographed overnumbered print)"
    >
      ✍ Signature
    </span>
  );
}

export function OvernumberedBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <span
      className="chip font-semibold uppercase"
      style={{ background: "linear-gradient(90deg,#a855f7,#7c3aed)", color: "#fff" }}
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
      style={{ background: "linear-gradient(90deg,#f472b6,#c026d3)", color: "#fff" }}
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
      style={{ background: "linear-gradient(90deg,#06b6d4,#0891b2)", color: "#04222a" }}
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
