import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { robots: { index: false } }; // auth/utility — never indexed

// The old wallet/escrow "sell" flow has been retired, and the peer-to-peer
// Marketplace that replaced it has since been removed too — RiftCompare is now a
// price-comparison site with no first-party selling. This stub keeps any old
// inbound /sell links off a 404 by sending them to the homepage.
export default function SellRedirect() {
  redirect("/");
}
