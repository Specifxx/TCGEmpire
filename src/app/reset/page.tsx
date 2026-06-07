import type { Metadata } from "next";
import { ResetForm } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ResetPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";
  return (
    <div className="mx-auto max-w-md py-10">
      <ResetForm token={token} />
    </div>
  );
}
