import { PAB_BOOT } from "@/lib/premium-ab";
import { PabSeen } from "./PabSeen";

// P1's B block (lib/premium-ab.ts): one line under /premium's headline with the
// biggest real gap the Deal Finder shows today. Rendered for every visitor and
// hidden unless the boot script put this visitor in arm B (globals.css), so it
// never shifts the layout. No deal read: nothing renders, and the arm still
// counts (pab_seen), which dilutes B rather than flattering it.
export interface PremiumProofDeal {
  name: string;
  href: string; // site-relative card URL
  store: string;
  price: string;
  market: string;
  belowPct: number;
}

export function PremiumDealProof({ deal }: { deal: PremiumProofDeal | null }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PAB_BOOT }} />
      <PabSeen />
      {deal && (
        <p className="pab1-b mt-3 hidden max-w-xl rounded-lg border border-ink-800 bg-ink-850 px-3 py-2 text-sm leading-relaxed text-slate-300" data-pab1-proof>
          <span className="font-semibold text-emerald-300">Found by Deal Finder today:</span>{" "}
          <a href={deal.href} className="font-semibold text-white hover:underline" data-no-cta-track>
            {deal.name}
          </a>{" "}
          at {deal.store} for <span className="num font-semibold text-white">{deal.price}</span>, {deal.belowPct.toFixed(0)}% under TCGplayer
          market ({deal.market}). Premium shows you every one.
        </p>
      )}
    </>
  );
}
