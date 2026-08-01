import { ADSENSE_CONFIGURED, ADSENSE_LOADER_SRC } from "@/lib/adsense";

// ─────────────────────────────────────────────────────────────────────────────
// The AdSense loader — rendered in <head> on EVERY page, unconditionally.
// ─────────────────────────────────────────────────────────────────────────────
// This single tag does three jobs at once:
//   1. It IS the site-ownership verification for the "AdSense code snippet"
//      method selected in the console. Google's reviewer fetches the page and
//      looks for this exact script.
//   2. It delivers Auto ads once the account is approved and Auto ads are on.
//   3. It delivers the Privacy & Messaging (Funding Choices) GDPR consent
//      message to EEA/UK/CH visitors. The published message has recorded 0
//      impressions purely because this script was never installed.
//
// IT MUST NEVER BE GATED. Not by ADSENSE_REVIEW_MODE, not by AD_UNITS_ENABLED,
// not by Premium status, not by an interaction. Those flags control whether ad
// UNITS fill; this script is the account's verification and consent transport.
//
// ── Why a plain <script async> and not <Script strategy="afterInteractive"> ──
// The remediation brief asked for next/script + afterInteractive. In the Next 14
// App Router that combination CANNOT satisfy the brief's own harder requirement
// that the loader "must appear in server-rendered HTML, verified with raw curl":
// next/script's app-dir path returns `null` from render for afterInteractive and
// injects the tag from a useEffect on the client, emitting only a
// <link rel="preload" as="script"> into the SSR'd HTML (see
// node_modules/next/dist/client/script.js — the `if (appDir)` branch). A raw
// curl would therefore find no <script>, and neither would a reviewer or
// verification bot that reads HTML without executing it.
//
// A bare <script async src> gets the same practical behaviour afterInteractive
// was chosen for — non-render-blocking, executed after parsing, zero hydration
// risk since React never owns its execution — while being physically present in
// the server HTML. This is the deliberate, documented deviation: crawler
// visibility is the requirement the AdSense review actually turns on.
//
// ── On its position in <head> ──
// React 18 treats every `<script async src>` as a hoistable RESOURCE: it floats
// the tag into the head preamble and re-emits it from a normalised prop set
// (src/async/crossOrigin/integrity/nonce only). That is not avoidable from here
// — onError and itemProp, the two documented hoisting bail-outs, are stripped
// along with everything else before the resource is written, and both were
// measured to make no difference. On streaming-rendered routes the preamble
// flushes before <head>'s ordinary children, so this tag lands a few KB ahead of
// the inline Consent Mode defaults in the byte stream.
//
// That ordering is harmless, and deliberately left alone. The defaults are an
// inline script a few KB further into a response whose head is ~6KB total — the
// parser runs them microseconds after buffering, while this tag cannot execute
// until a fresh cross-origin connection to pagead2.googlesyndication.com has
// completed. The defaults always win by tens of milliseconds. See
// docs/adsense-remediation.md § Phase 4 for the full analysis and the options
// considered.
export function AdSenseLoader() {
  // Only omitted when no publisher id is configured at all — a build with an
  // invalid id never gets this far (lib/adsense.ts throws in production).
  if (!ADSENSE_CONFIGURED) return null;
  return <script async src={ADSENSE_LOADER_SRC} crossOrigin="anonymous" />;
}
