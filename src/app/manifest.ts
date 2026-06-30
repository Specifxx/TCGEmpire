import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

// PWA web app manifest — lets the site be "add to home screen"/installable and
// gives search engines + the OS app metadata. Icons reuse the existing brand
// marks served from /icon.png and /public/icon-512.png. theme_color matches the
// viewport themeColor in app/layout.tsx (the ink-950 brand background).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Riftbound Card Database & Price Comparison`,
    short_name: SITE_NAME,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
