import { redirect } from "next/navigation";

// The old wallet/escrow "sell" flow has been retired — selling now happens on the
// community Forum.
export default function SellRedirect() {
  redirect("/forum");
}
