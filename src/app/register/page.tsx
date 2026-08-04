import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/oauth";

// auth/utility — never indexed. Self-canonical for the same reason as /login:
// several CTAs across the site link here with ?next=<path>, and without a
// canonical every variant is its own crawlable URL. See app/login/page.tsx.
export const metadata: Metadata = {
  robots: { index: false },
  alternates: { canonical: "/register" },
};

function safe(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/profile";
}

export default async function RegisterPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getCurrentUser();
  if (user) redirect(safe(searchParams.next));
  return <AuthForm mode="register" providers={enabledProviders()} />;
}
