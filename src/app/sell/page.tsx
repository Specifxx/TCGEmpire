import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { robots: { index: false } }; // auth/utility — never indexed

// The old wallet/escrow "sell" flow has been retired — selling now happens on the
// community Forum.
export default function SellRedirect() {
  redirect("/forum");
}
