// ─────────────────────────────────────────────────────────────────────────────
// Journey by Mediavine — the site script, rendered in <head> on every page.
// ─────────────────────────────────────────────────────────────────────────────
// Added 2026-10-24 after the Journey approval: Mediavine verifies the site by
// fetching a page and looking for this script, so like the AdSense loader it is
// a plain server-rendered <script async> (see AdSenseLoader.tsx for why not
// next/script) and is not gated by Premium, review mode or anything else.
//
// The snippet Mediavine hands out also carries data-noptimize and
// data-cfasync="false". Those only tell WordPress optimisers and Cloudflare
// Rocket Loader to leave the tag alone; neither runs here, and React hoists an
// async script with its props normalised to src/async anyway.
//
// AdSense still loads alongside it until the switch is decided. Once Journey
// serves ads, the ad-free tier (lib/ad-free-boot.ts) does not pause it yet.
export const MEDIAVINE_SCRIPT_SRC =
  "https://scripts.mediavine.com/tags/b0441766-9abe-4ecb-b607-4fe0063eb39b.js";

export function MediavineLoader() {
  return <script async src={MEDIAVINE_SCRIPT_SRC} />;
}
