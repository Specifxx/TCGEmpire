"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Hides a group of header controls until the visitor scrolls — ONLY on the
// homepage ("/"), exactly the same >8px scroll gate HeaderSearchSlot already
// applies to the header's search field, generalised to the rest of the
// header's secondary nav.
//
// WHY: the redesign brief protects exactly two header items by name —
// "Marketplace and Premium stay prominent — they're monetisation" — and
// separately sets a hard target of ≤12 interactive elements above the fold
// ON THE HOMEPAGE, "desktop, incl. header". Naming only two items worth
// protecting, in the same document that budgets the WHOLE header against that
// ≤12 ceiling, reads as intentional: the header's other links (Database,
// Sealed, Decks, Blog, the ⌘K launcher, Discord) aren't asked to disappear,
// just to not cost the homepage's first screen — a visitor who scrolls at all
// gets every one of them back within a few pixels, exactly as already happens
// for the search field.
//
// This also fixes a real, separate defect scripts/homepage-audit.mjs caught
// on a live render: the header's own CountrySwitcher and the hero's own
// CountryHeroToggle were BOTH visible above the fold at once on "/" — two
// region selectors doing the same job simultaneously, exactly what the brief's
// "0 duplicate region selectors above the fold" hard target rules out. Gating
// CountrySwitcher here (alongside NavUser, which has no on-page duplicate but
// the same "not the job of this screen" reasoning applies) resolves it the
// same way the search field's own duplicate was resolved in an earlier phase.
//
// MobileNav (the hamburger) is deliberately NEVER wrapped in this: on phones
// it is the ONLY way to reach Sealed/Decks/Blog/Discord/Premium at all (they
// have no other header presence below `lg`), so hiding it pre-scroll would
// strand a mobile visitor with no navigation whatsoever until they scrolled —
// a real regression this component must not cause. Same reasoning protects
// the logo (brand identity + the site's own home link) and, per the brief's
// own line, Marketplace and Premium — none of those are ever wrapped here.
//
// `display: contents` when revealed (not e.g. `flex`/`inline-flex`): the
// wrapper must not generate its own box or it would eat one of the parent
// nav's `gap-*` slots per GROUP instead of per LINK, visibly tightening the
// spacing between, say, Database and Sealed relative to Sealed and Decks.
// `contents` makes the children participate directly in the parent flex
// layout as if this wrapper were never there — the only thing it ever
// contributes is the `hidden` state before scroll.
export function HomeHeaderReveal({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(!isHome);

  useEffect(() => {
    if (!isHome) {
      setScrolled(true);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 8);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isHome]);

  return <div className={scrolled ? "contents" : "hidden"}>{children}</div>;
}
