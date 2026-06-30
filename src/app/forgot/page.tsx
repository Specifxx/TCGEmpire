import type { Metadata } from "next";
import { ForgotForm } from "@/components/AccountForms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md py-10">
      <ForgotForm />
    </div>
  );
}
