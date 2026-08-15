import { ADSENSE_PUB_ID } from "@/lib/adsense";

// ─────────────────────────────────────────────────────────────────────────────
// /ads.txt — IAB Authorized Digital Sellers
// ─────────────────────────────────────────────────────────────────────────────
// The AdSense console reported this as "Not found". It wasn't missing so much as
// wrong: with no route claiming the path, Next served the App Router's HTML shell
// (a 200 with text/html and a full page in the body), which the ads.txt crawler
// reads as "no valid records" — indistinguishable from absent, and a standing
// warning on the Sites page for as long as it lasts.
//
// This route serves the file the crawler expects and nothing else:
//   • HTTP 200, no redirect (a 301 — including a www or trailing-slash hop —
//     is followed only one level by some crawlers and is a common silent failure)
//   • Content-Type: text/plain; charset=utf-8
//   • a bare record body, LF-terminated
//
// The seller id is DERIVED from NEXT_PUBLIC_ADSENSE_CLIENT_ID by stripping the
// "ca-" prefix, so the file can never drift from the loader script the way the
// old hardcoded meta tag drifted from the account under review.
//
// f08c47fec0942fa0 is Google's own certification-authority id. It is the same
// constant for every AdSense publisher — it identifies Google as the ad system,
// not this account — which is why it is written literally here.

// Static: the body depends only on build-time env, so there's nothing per-request
// to compute. `force-static` also guarantees no cookie/header read sneaks in and
// turns this into a dynamic route.
export const dynamic = "force-static";

// ── Additional authorised sellers ────────────────────────────────────────────
// LEFT EMPTY DELIBERATELY. eBay Partner Network and TCGplayer/Impact are
// affiliate programs, not programmatic ad systems: they pay per referred sale
// through a tracking link and do not buy or resell inventory on this domain, so
// neither issues ads.txt records and neither belongs in this file. Inventing a
// line for them would introduce an unverifiable seller record, which is worse
// than an absent one.
//
// If a future ad partner (a header-bidding SSP, an ad-network reseller, an
// AdExchange partner) DOES supply records, paste them between the markers below
// exactly as that partner published them — one record per line, never edited:
//
//   <domain>, <publisher id>, DIRECT|RESELLER, <certification authority id>
//
// ── BEGIN PARTNER RECORDS ───────────────────────────────────────────────────
const PARTNER_RECORDS: string[] = [];
// ── END PARTNER RECORDS ─────────────────────────────────────────────────────

export function GET() {
  const body = [`google.com, ${ADSENSE_PUB_ID}, DIRECT, f08c47fec0942fa0`, ...PARTNER_RECORDS].join("\n") + "\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // An hour: long enough to be cheap, short enough that adding a partner
      // record propagates the same day.
      "Cache-Control": "public, max-age=3600",
      // ads.txt is a crawler artefact, never a search result.
      "X-Robots-Tag": "noindex",
    },
  });
}
