// The visible affiliate disclosure, shown IMMEDIATELY ADJACENT to every
// affiliate link/banner on the site.
//
// WHY THIS EXISTS AS A COMPONENT: the eBay Partner Network Quality Team flagged
// (Jul 2026) that although the site carried correctly-worded disclosure text, its
// PLACEMENT was too far from the actual eBay affiliate links to be noticed — and
// that the card quick-view popup contained eBay affiliate links with no
// disclosure at all. EPN Participation Requirements I.G. requires the disclosure
// be "clear and prominent" and near the promotional content. The same FTC-derived
// requirement applies to the TCGplayer/Impact program, so both partners are
// covered here. Amazon Associates joined them on 2026-09-26 ("Blog and tools,
// joined up" in DECISIONS.md): /sealed links Amazon searches, and the
// Associates Operating Agreement requires its own statement, word for word,
// wherever those links appear. It is a separate partner, not folded into
// "both", so the eBay and TCGplayer lines every other page renders stay
// exactly as they were.
//
// RULES FOR EDITING:
//  - Never hide this behind a hover, tooltip, `sr-only`, collapsed <details>, or
//    an element that only renders after interaction. It must be visible on first
//    paint next to the link it describes.
//  - Never render it for only some visitors (e.g. skipping it for Premium). If an
//    affiliate link renders, its disclosure renders.
//  - Keep the words "affiliate" and the earning relationship explicit. The one
//    exception is the Amazon line, whose wording is Amazon's and is not edited;
//    where it renders, the page's eBay line says "affiliate" beside it.
//
// The machine-readable half of the disclosure (rel="sponsored nofollow") lives in
// lib/affiliate.ts's outboundRel() — both halves are required, neither replaces
// the other.

type Partner = "ebay" | "tcgplayer" | "both" | "amazon";

const TEXT: Record<Partner, string> = {
  // EPN's own suggested phrasing, adapted to third person.
  ebay: "Affiliate link: as an eBay Partner Network affiliate, RiftCompare earns from qualifying purchases — at no extra cost to you.",
  tcgplayer:
    "Affiliate link: RiftCompare earns a commission from qualifying TCGplayer purchases — at no extra cost to you.",
  both: "Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, RiftCompare earns from qualifying purchases — at no extra cost to you.",
  // Amazon's required wording, unaltered (Associates Program Operating
  // Agreement): no prefix and no paraphrase.
  amazon: "As an Amazon Associate, RiftCompare earns from qualifying purchases.",
};

export function AffiliateDisclosure({
  partner = "ebay",
  // `tight` trims the top margin for slotting directly under a banner/CTA.
  tight,
  className,
}: {
  partner?: Partner;
  tight?: boolean;
  className?: string;
}) {
  return (
    <p
      // slate-400 on the dark surfaces clears WCAG AA comfortably — a disclosure
      // that's technically present but visually washed out isn't "prominent".
      className={`${tight ? "mt-1" : "mt-2"} text-[11px] leading-snug text-slate-400 ${className ?? ""}`}
    >
      {TEXT[partner]}
    </p>
  );
}

// A per-LINK companion to AffiliateDisclosure above, not a replacement for it. The
// panel-level disclosure carries the full "at no extra cost to you" sentence; this
// is the short tag the FTC's 2023 Endorsement Guides revision asks for immediately
// beside the individual link itself — the guides call out the bare phrase
// "affiliate link" as insufficient on its own for a reader in a hurry, hence
// "Paid link" here instead. Render this ONLY where the specific link is actually
// monetised (see isPaidLink in lib/affiliate.ts) — labelling every row, including
// the majority of Shopify store links that earn nothing today, would be an
// inaccurate claim in the other direction.
export function PaidLinkTag({ className }: { className?: string }) {
  return (
    <span
      className={`chip bg-ink-800 text-[10px] text-slate-400 ${className ?? ""}`}
      title="We earn a commission on purchases through this link, at no extra cost to you."
    >
      Paid link
    </span>
  );
}
