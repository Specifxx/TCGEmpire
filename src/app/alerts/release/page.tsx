import type { Metadata } from "next";
import { ReleaseAlertStop } from "@/components/ReleaseAlertSignup";

export const metadata: Metadata = {
  title: "Stop release alerts",
  robots: { index: false },
  referrer: "no-referrer",
};

export default function ReleaseAlertStopPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <ReleaseAlertStop token={token} />
    </div>
  );
}
