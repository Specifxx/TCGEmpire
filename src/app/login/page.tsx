import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/oauth";
import { SIGNUP_PREMIUM_DAYS } from "@/lib/premium";
import { pageAlternates } from "@/lib/seo";

// auth/utility — never indexed. The self-referencing canonical is what collapses
// the ?next= family: the navbar's sign-in link carries the current path as ?next=,
// so Googlebot can discover one /login?next=<path> variant per public URL (~1,600).
// Without a canonical each of those is a distinct URL burning crawl budget; with
// it they all consolidate to /login. (The link itself is also rel=nofollow — see
// components/UserMenu.tsx. Deliberately NOT robots-disallowed: a Disallow would
// stop Google seeing the noindex — see app/robots.ts.)
export const metadata: Metadata = {
  robots: { index: false },
  alternates: pageAlternates("/login"),
};

function safe(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/profile";
}

// Where "cancel" goes, for a signed-out visitor who landed here (often
// redirected, unasked, off a gated feature) and wants back out. NOT safe()'s
// "/profile" fallback — that requires being signed in, so an unauthenticated
// visitor with no `next` clicking Cancel would just bounce straight back to
// this same page. Falls back to the homepage instead, which is always a real
// escape route.
function cancelTarget(next?: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getCurrentUser();
  if (user) redirect(safe(searchParams.next));
  return (
    <AuthForm
      providers={enabledProviders()}
      cancelHref={cancelTarget(searchParams.next)}
      signupPremiumDays={SIGNUP_PREMIUM_DAYS}
    />
  );
}
