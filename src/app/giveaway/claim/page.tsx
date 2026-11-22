import type { Metadata } from "next";
import { GiveawayClaimForm } from "@/components/giveaway/GiveawayClaimForm";

// /giveaway/claim#t=<token>: the winner's private form for a postal address (lib/giveaway-run.ts emails the link). Static shell;
// the token stays in the fragment, so it never reaches a log or the CDN, and the form posts it to /api/giveaway/claim.
export const revalidate = 86400;
export const metadata: Metadata = { title: "Claim your prize", robots: { index: false, follow: false } };

export default function GiveawayClaimPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <GiveawayClaimForm />
    </main>
  );
}
