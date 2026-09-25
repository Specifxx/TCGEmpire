import type { Metadata } from "next";
import { UnsubscribeClient } from "@/components/UnsubscribeClient";

// The footer of every price-alert email. Pauses by default (keeps the
// watchlist); ?mode=delete (the footer's "Delete all my watches") opens with
// the explicit delete confirmation shown. See UnsubscribeClient.
export const metadata: Metadata = {
  title: "Pause price-alert emails",
  robots: { index: false },
  referrer: "no-referrer",
};

export default function UnsubscribePage({ searchParams }: { searchParams: { token?: string; mode?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <UnsubscribeClient token={token} focus={searchParams.mode === "delete" ? "delete" : "pause"} />
    </div>
  );
}
