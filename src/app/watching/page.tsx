import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Watchlist } from "@/components/Watchlist";

// getCurrentUser() reads cookies(), so this route can never be cached. Declared
// explicitly rather than left to inference — a stray session read is what once
// killed ISR site-wide here.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My watchlist — cards you're tracking",
  description: "Every Riftbound card you're watching for a price drop, with the price you started tracking at.",
  // Personal page: never indexed. Deliberately NOT disallowed in robots.txt
  // either — a Disallow would stop Google seeing this noindex, which is exactly
  // how pages end up in the "Indexed, though blocked by robots.txt" bucket.
  robots: { index: false, follow: false },
};

// THE PATH IS /watching, NOT /watchlist, AND THAT IS DELIBERATE.
//
// next.config.js has redirected /watchlist -> /alerts (the price-alerts
// explainer) since long before this page existed, because "watchlist" is a
// keyword that page targets. Redirects in next.config.js are matched BEFORE
// routing, so a page at src/app/watchlist/ never renders at all — this one
// shipped dead, and every nav link pointing at it sent signed-in users to a
// marketing page instead of their own list.
//
// The obvious fix — delete the redirect — is the wrong one. It is
// `permanent: true`, i.e. a 308, which browsers cache indefinitely and which
// cannot be revoked from the server. Anyone who already hit /watchlist would
// keep being bounced to /alerts no matter what we serve there afterwards. So
// the personal page moves to a path that has never issued a redirect, and
// /watchlist keeps its SEO job pointing at the explainer.
//
// tests/watchlist.test.ts asserts no next.config.js redirect ever shadows an
// app route again.
export default async function WatchingPage() {
  const user = await getCurrentUser();
  // A redirect, not a blurred/gated page: an account wall rendered as content is
  // what the AdSense audit flags as a paywall.
  if (!user) redirect("/login?next=/watching");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">My watchlist</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">🔔 My watchlist</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Every card you&apos;re tracking, with the price it was at when you started. We email{" "}
          <strong className="text-slate-200">{user.email}</strong> whenever one of them drops below that
          figure — tap the bell on any card to stop watching it.
        </p>
      </div>

      <Watchlist />
    </div>
  );
}
