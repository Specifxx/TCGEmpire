// ─────────────────────────────────────────────────────────────────────────────
// Ezoic — the site's ad network
// ─────────────────────────────────────────────────────────────────────────────
// Domain DNS moved from Vercel to Ezoic's nameservers (Ezoic Cloud): Ezoic now
// reverse-proxies all traffic to this app, which is still hosted on Vercel
// unchanged. Ezoic replaces direct Google AdSense as the ad network — see
// docs/adsense-remediation.md for the AdSense-era history this supersedes, and
// docs/ezoic-integration.md for what's still a manual step on the owner's side.
//
// NEXT_PUBLIC_AD_NETWORK selects which network is ACTIVE. Both integrations stay
// wired in (lib/adsense.ts + AdSenseLoader.tsx are untouched, just gated off) so
// switching back — or turning AdSense back on as one of Ezoic's mediated demand
// sources — is a one-line env change, not a rewrite.
//
//   ezoic     (default) — Ezoic's standalone header script loads; the direct
//                          AdSense loader/meta tag do not render.
//   adsense              — the pre-Ezoic behaviour: direct AdSense only.
//   none                 — neither (e.g. local dev without ads).
const RAW = (process.env.NEXT_PUBLIC_AD_NETWORK ?? "ezoic").trim().toLowerCase();

export type AdNetwork = "adsense" | "ezoic" | "none";
export const AD_NETWORK: AdNetwork = RAW === "adsense" ? "adsense" : RAW === "none" ? "none" : "ezoic";

export const EZOIC_ENABLED = AD_NETWORK === "ezoic";

// ─────────────────────────────────────────────────────────────────────────────
// Ad-serving domains — the allow-list next.config.js's CSP must include
// ─────────────────────────────────────────────────────────────────────────────
// Confirmed against Ezoic's own integration docs (docs.ezoic.com/docs/ezoicads/
// integration) — the standalone header script (sa.min.js), its consent-manager
// dependency (gatekeeperconsent.com, both subdomains) and Ezoic Analytics.
// Ezoic's ad rendering itself (creative delivery, the exchanges it mediates)
// happens through many more third-party origins that Ezoic's own proxy layer
// injects and that aren't published as a fixed list — this covers only the
// header script this codebase loads directly.
export const EZOIC_SCRIPT_ORIGINS = [
  "https://cmp.gatekeeperconsent.com",
  "https://the.gatekeeperconsent.com",
  "https://www.ezojs.com",
  "https://ezoicanalytics.com",
];
