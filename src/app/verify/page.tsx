import type { Metadata } from "next";
import { VerifyClient } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Confirm email", robots: { index: false } };

export default function VerifyPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <VerifyClient token={token} />
    </div>
  );
}
