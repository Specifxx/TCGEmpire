import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/oauth";

// auth/utility — never indexed. The self-referencing canonical is what collapses
// the ?next= family: the navbar's sign-in link carries the current path as ?next=,
// so Googlebot can discover one /login?next=<path> variant per public URL (~1,600).
// Without a canonical each of those is a distinct URL burning crawl budget; with
// it they all consolidate to /login. (The link itself is also rel=nofollow — see
// components/UserMenu.tsx. Deliberately NOT robots-disallowed: a Disallow would
// stop Google seeing the noindex — see app/robots.ts.)
export const metadata: Metadata = {
  robots: { index: false },
  alternates: { canonical: "/login" },
};

function safe(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/profile";
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getCurrentUser();
  if (user) redirect(safe(searchParams.next));
  return <AuthForm mode="login" providers={enabledProviders()} />;
}
