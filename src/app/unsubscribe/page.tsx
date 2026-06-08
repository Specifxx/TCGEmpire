import type { Metadata } from "next";
import { UnsubscribeClient } from "@/components/UnsubscribeClient";

export const metadata: Metadata = {
  title: "Unsubscribe from price-drop alerts",
  robots: { index: false },
};

export default function UnsubscribePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <UnsubscribeClient token={token} />
    </div>
  );
}
