import React from "react";
import type { ProductOgLines } from "./og-lines";

// The Pokémon product share card, and the brand-only card every Pokémon image
// route falls back to. Compositions only, as pure functions of already-built
// lines (lib/pokemon/og-lines.ts), for the reason lib/card-og.tsx gives: an
// image route may export only the names Next recognises, and a plain module can
// be rendered from a fixture. The routes are the data hop.
//
// Satori rules (tests/og-images.test.ts reads this file): every <div> with more
// than one child sets display "flex", and every style is an object literal. No
// emoji and no web fonts: either would make every render fetch over the network.

export const POKEMON_OG_SIZE = { width: 1200, height: 630 };

const RED = "#e5484d";
const INK = "#0b0f17";
const BACKGROUND = "linear-gradient(135deg, #0b0f17 0%, #151a26 60%, #2a1016 100%)";

/** The section's mark: a Pokéball drawn in CSS, then the site name. */
function BrandRow({ size = 52 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          borderRadius: size / 2,
          border: `5px solid ${INK}`,
          background: `linear-gradient(180deg, ${RED} 50%, #ffffff 50%)`,
          marginRight: 18,
        }}
      />
      <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: "#ffffff" }}>RiftCompare</div>
    </div>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "8px 18px",
        borderRadius: 12,
        border: `2px solid ${RED}66`,
        background: `${RED}1f`,
        color: "#ffffff",
        fontSize: 24,
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
}

/**
 * Fetches a product image into a data URI for Satori, within `ms`. The 400px
 * rendition: the card shows it at 400px, and it is a fifth of the 1000px file.
 * Null on any failure, and the card renders without art.
 */
export async function ogImageDataUri(imageUrl: string | null, ms = 1500): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl.replace(/_in_1000x1000\.jpg$/, "_400w.jpg"), { signal: AbortSignal.timeout(ms) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png)\b/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 1_500_000) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const nameSize = (name: string) => (name.length > 64 ? 38 : name.length > 40 ? 46 : 56);

export function ProductOgImage({ lines, art }: { lines: ProductOgLines; art: string | null }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 64px",
        background: BACKGROUND,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BrandRow />
        <Chip text="US prices" />
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: art ? 40 : 0 }}>
          <div style={{ display: "flex", color: "#a3acbb", fontSize: 24, fontWeight: 600 }}>{lines.context}</div>
          <div style={{ display: "flex", color: "#ffffff", fontSize: nameSize(lines.name), fontWeight: 800, lineHeight: 1.08, marginTop: 6 }}>
            {lines.name}
          </div>
          {lines.headline ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
              <div style={{ display: "flex", color: "#a3acbb", fontSize: 24, fontWeight: 600 }}>{lines.headline.label}</div>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <div style={{ display: "flex", color: "#ffffff", fontSize: 76, fontWeight: 800, lineHeight: 1 }}>{lines.headline.price}</div>
                <div style={{ display: "flex", color: "#a3acbb", fontSize: 28, fontWeight: 600, marginLeft: 14 }}>{lines.headline.source}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", color: "#a3acbb", fontSize: 36, fontWeight: 700, marginTop: 22 }}>{lines.noListing}</div>
          )}
          {lines.perPack ? (
            <div style={{ display: "flex", color: RED, fontSize: 32, fontWeight: 800, marginTop: 10 }}>{lines.perPack}</div>
          ) : null}
          {lines.reference ? (
            <div style={{ display: "flex", color: "#cbd2dc", fontSize: 24, marginTop: 10 }}>{lines.reference}</div>
          ) : null}
          {lines.preorder ? (
            <div style={{ display: "flex", color: "#7dd3fc", fontSize: 24, fontWeight: 700, marginTop: 8 }}>{lines.preorder}</div>
          ) : null}
        </div>
        {art ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 360,
              height: 360,
              borderRadius: 20,
              background: "#ffffff",
              padding: 20,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws this, no browser loads it */}
            <img src={art} width={320} height={320} alt="" aria-hidden="true" style={{ objectFit: "contain" }} />
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", color: "#a3acbb", fontSize: 22 }}>{lines.footer}</div>
    </div>
  );
}

/**
 * The card for a missing product or set, a read error, or any page without its
 * own image: an unfurl must always produce an image, never a 500. It claims no
 * source and no figure, so it is true whatever the data says.
 */
export function PokemonBrandOgImage() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: BACKGROUND,
        fontFamily: "sans-serif",
      }}
    >
      <BrandRow size={64} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#ffffff", letterSpacing: -2 }}>Pokémon sealed prices</div>
        <div style={{ display: "flex", fontSize: 32, color: "#a3acbb", marginTop: 12 }}>
          The cheapest listings we track and the price per pack. Updated daily.
        </div>
      </div>
      <div style={{ display: "flex" }}>
        <Chip text="Booster boxes · Elite Trainer Boxes · Booster bundles" />
      </div>
    </div>
  );
}
