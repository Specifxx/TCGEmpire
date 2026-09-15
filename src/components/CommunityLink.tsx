"use client";

import { trackEvent } from "@/lib/analytics";
import type { CommunityResource } from "@/lib/content/community";

// Plain outbound link for /community — deliberately NOT OutboundLink.tsx,
// which is purchase-tracking-specific (buy_click, Google Ads conversion
// reporting, Capacitor native-browser redirect). Nothing here is a sale, so
// none of that applies. Also deliberately not `outboundRel()` (lib/affiliate.ts):
// that helper's rel string discloses a paid placement, which would misrepresent
// an unpaid, non-affiliate link — see community.ts's header on why this page
// has no commercial relationship with anything it links to.
export function CommunityLink({ resource }: { resource: CommunityResource }) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={() => trackEvent("community_link_click", { source: resource.source, url: resource.url })}
      className="card-surface flex flex-col gap-1 border border-transparent p-4 transition-colors hover:border-brand-500"
    >
      <span className="text-sm font-bold text-white">{resource.source}</span>
      <span className="text-xs text-slate-500">{resource.description}</span>
    </a>
  );
}
