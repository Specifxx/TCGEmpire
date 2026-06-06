import { redirect } from "next/navigation";

// The old wallet/escrow "buy orders" flow has been retired — buying/selling now
// happens on the community Forum.
export default function WantedRedirect() {
  redirect("/forum");
}
