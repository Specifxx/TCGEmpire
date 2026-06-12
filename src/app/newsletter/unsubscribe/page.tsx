import type { Metadata } from "next";
import { NewsletterUnsubscribeClient } from "@/components/NewsletterUnsubscribeClient";

export const metadata: Metadata = {
  title: "Unsubscribe from the weekly Index summary",
  robots: { index: false },
};

export default function NewsletterUnsubscribePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <NewsletterUnsubscribeClient token={token} />
    </div>
  );
}
