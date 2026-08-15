import { EZOIC_ENABLED } from "@/lib/ezoic";

// Ezoic's standalone header integration script, rendered in <head> on every
// page — the network-selection counterpart to AdSenseLoader.tsx (see that
// file's header comment for why these are plain <script> tags rather than
// next/script: the same App Router SSR-visibility reasoning applies here).
//
// data-cfasync="false" on the consent-manager scripts is Ezoic's own published
// snippet attribute (it opts the tag out of unrelated CDN "combine JS" rewrites
// some hosts perform) — kept even though it's a no-op on this stack, since it's
// harmless and matches the snippet byte-for-byte if it's ever diffed against
// Ezoic's docs.
export function EzoicLoader() {
  if (!EZOIC_ENABLED) return null;
  return (
    <>
      <script data-cfasync="false" async src="https://cmp.gatekeeperconsent.com/min.js" />
      <script data-cfasync="false" async src="https://the.gatekeeperconsent.com/cmp.min.js" />
      <script async src="https://www.ezojs.com/ezoic/sa.min.js" />
      <script async src="https://ezoicanalytics.com/analytics.js" />
      <script
        dangerouslySetInnerHTML={{
          __html: "window.ezstandalone=window.ezstandalone||{};ezstandalone.cmd=ezstandalone.cmd||[];",
        }}
      />
    </>
  );
}
