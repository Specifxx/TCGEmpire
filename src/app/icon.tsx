import { ImageResponse } from "next/og";

// Edge runtime is the intended path for ImageResponse/@vercel/og (and avoids a
// Windows-only Node prerender bug).
export const runtime = "edge";

// Code-generated RASTER (PNG) app icon. Google Search only uses raster favicons
// (not SVG), so an SVG-only icon showed a generic globe. This renders the
// RiftCompare "RC" mark as a 192×192 PNG (a multiple of 48px, per Google's guidance).
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #16273f 0%, #0a1320 100%)",
          borderRadius: 44,
          fontSize: 120,
          fontWeight: 900,
          letterSpacing: -8,
        }}
      >
        <span style={{ color: "#ffffff" }}>R</span>
        <span style={{ color: "#3ad07f" }}>C</span>
      </div>
    ),
    size
  );
}
