import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { robots: { index: false } }; // auth/utility — never indexed

// The old wallet/escrow "buy orders" flow has been retired — buying/selling now
// happens on the Marketplace.
export default function WantedRedirect() {
  redirect("/marketplace");
}
