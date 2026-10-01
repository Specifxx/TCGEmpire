import React from "react";
import type { SetOgLines } from "./og-lines";

// The Pokémon set share card: the cheapest booster box, ETB and booster bundle
// in the set, each with its price per pack, all US figures and labelled so. A
// composition only (lines from lib/pokemon/og-lines.ts setOgLines); the route
// app/pokemon/sets/[set]/opengraph-image.tsx is the data hop, and it falls back
// to PokemonBrandOgImage (lib/pokemon/product-og.tsx) for an unknown set.
//
// Satori rules as in product-og.tsx: display "flex" on every multi-child <div>,
// object-literal styles, no emoji, no web fonts.

const RED = "#e5484d";
const INK = "#0b0f17";

export function SetOgImage({ lines }: { lines: SetOgLines }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px 64px",
        background: "linear-gradient(135deg, #0b0f17 0%, #151a26 60%, #2a1016 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: 52,
              height: 52,
              borderRadius: 26,
              border: `5px solid ${INK}`,
              background: `linear-gradient(180deg, ${RED} 50%, #ffffff 50%)`,
              marginRight: 18,
            }}
          />
          <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: "#ffffff" }}>RiftCompare</div>
        </div>
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
          {lines.label}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", color: "#a3acbb", fontSize: 26, fontWeight: 600 }}>{lines.context}</div>
        <div style={{ display: "flex", color: "#ffffff", fontSize: lines.name.length > 24 ? 64 : 76, fontWeight: 800, lineHeight: 1.05, marginTop: 6 }}>
          {`${lines.name} sealed prices`}
        </div>
        {lines.release ? (
          <div style={{ display: "flex", color: "#7dd3fc", fontSize: 26, fontWeight: 700, marginTop: 10 }}>{lines.release}</div>
        ) : null}
      </div>

      {lines.rows.length ? (
        <div style={{ display: "flex", gap: 18 }}>
          {lines.rows.map((r) => (
            <div
              key={r.kind}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "18px 22px",
                borderRadius: 16,
                border: "2px solid #2a3142",
                background: "#121722",
              }}
            >
              <div style={{ display: "flex", color: "#a3acbb", fontSize: 24, fontWeight: 600 }}>{r.kind}</div>
              <div style={{ display: "flex", color: "#ffffff", fontSize: 34, fontWeight: 800, marginTop: 6 }}>{r.price}</div>
              {r.perPack ? <div style={{ display: "flex", color: RED, fontSize: 26, fontWeight: 800, marginTop: 4 }}>{r.perPack}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", color: "#a3acbb", fontSize: 30, fontWeight: 700 }}>No tracked US listing yet</div>
      )}

      <div style={{ display: "flex", color: "#a3acbb", fontSize: 22 }}>{lines.footer}</div>
    </div>
  );
}
