"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NewsletterSignup } from "./NewsletterSignup";
import { useMe } from "@/lib/use-me";
import { markSignupSource } from "@/lib/signup-source";
import { trackSignupCta } from "@/lib/growth-events";

// Inline sign-up CTA for the blog and guide templates (2026-09-24 growth pass),
// placed once after an article's intro and once at its end. It reuses the two
// existing sign-up paths rather than adding a third: the newsletter form, and a
// link to the free-account OAuth screen with the reader's return path.
//
// "Get Radiance spoilers + price moves by email" until 23 Oct — true because
// the weekly digest carries a "New Radiance reveals this week" section until
// then (lib/newsletter.ts revealsSection). The heading is chosen by the server
// (ArticleView) from isBeforeRadianceRelease, so both switch off together.
export function ArticleSignupCta({
  placement,
  radianceSeason,
}: {
  placement: "article_intro" | "article_end";
  radianceSeason: boolean;
}) {
  const { user, loaded } = useMe();
  const pathname = usePathname();
  const heading = radianceSeason
    ? "Get Radiance spoilers + price moves by email"
    : "Get the week's Riftbound price moves by email";
  const next = pathname ? `/login?next=${encodeURIComponent(pathname)}` : "/login";

  return (
    <aside aria-label="Email sign-up" className="not-prose my-6">
      <NewsletterSignup
        siteName="RiftCompare"
        variant="card"
        source={placement}
        heading={heading}
        cta="Email me"
        done={radianceSeason ? "✓ You're on the list — new reveals and price moves every week." : undefined}
        button="primary"
      />
      {/* Signed-in readers already have an account; the newsletter alone is the offer. */}
      {loaded && !user && (
        <p className="mt-2 text-xs text-slate-400">
          Or{" "}
          <Link
            href={next}
            rel="nofollow"
            onClick={() => {
              markSignupSource(placement);
              trackSignupCta(placement);
            }}
            className="font-semibold text-brand-300 underline-offset-2 hover:underline"
          >
            create a free account
          </Link>{" "}
          for price-drop alerts on the cards you want.
        </p>
      )}
    </aside>
  );
}
