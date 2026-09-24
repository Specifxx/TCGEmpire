import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { enabledProviders } from "@/lib/oauth";
import { pageAlternates } from "@/lib/seo";
import { sanitizeNextPath } from "@/lib/next-param";

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

// One line of destination-specific persuasion, so a visitor bounced here off a
// gated feature (/watching, /portfolio redirect straight to /login?next=…)
// lands on a reason instead of a cold form. Unknown destinations get none.
const CONTEXT_LINES: Record<string, string> = {
  "/watching": "Sign in to see and manage every card you're watching in one place.",
  "/portfolio": "Sign in to track what your collection is worth, live.",
  "/profile": "Sign in to get back to your account.",
  "/dashboard": "Sign in to open your dashboard.",
  // The two tools whose signed-out preview promises the top three to a free
  // account (2026-09-23) — the line repeats that promise on the sign-in step.
  "/tools/deal-finder": "Create a free account to see today's top 3 deals in every Deal Finder view.",
  "/tools/rising": "Create a free account to see the top 3 rising cards, with their full signal breakdown.",
};

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const user = await getCurrentUser();
  // "Safe internal path" is defined once in lib/next-param.ts (the OAuth start
  // route and callback apply the same rule); the fallbacks differ per use:
  // an already-signed-in visitor goes to /profile, a Cancel link goes home
  // (an unauthenticated visitor sent to /profile would just bounce back here).
  const next = sanitizeNextPath(searchParams.next);
  if (user) redirect(next ?? "/profile");
  return (
    <AuthForm
      providers={enabledProviders()}
      cancelHref={next ?? "/"}
      next={next ?? undefined}
      contextLine={next ? CONTEXT_LINES[next] : undefined}
    />
  );
}
