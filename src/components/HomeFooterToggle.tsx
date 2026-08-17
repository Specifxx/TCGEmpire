"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Shows `children` only while on the given route match — used by FooterNav
// (a plain SERVER component; see that file's own doc comment for why this
// toggle lives in a separate client file rather than making FooterNav itself
// "use client") to pick between its two pre-rendered footer layouts without
// either one ever being JS-only navigation.
//
// BOTH layouts are real, server-rendered `<Link href>` anchors, always both
// present in the raw HTML — this component only ever toggles a CSS `hidden`
// class after hydration, exactly the same non-unmounting visibility pattern
// HeaderSearchSlot/HomeHeaderReveal already use elsewhere in this codebase
// for the same reason: a crawler or a visitor with JS disabled sees BOTH
// footer layouts' links (redundant, but never absent — the FOOTER_GROUPS
// links this guards are the only remaining path to over a dozen sections the
// homepage-redesign brief moved out of the homepage body), and only a
// visitor whose browser actually runs this effect ever sees just one.
//
// `match`: "home" shows children only on "/"; "other" shows them everywhere
// else. Always resolved server-side-correctly on the very first paint —
// usePathname() already returns the right value on the initial render, no
// flash of the wrong variant.
export function HomeFooterToggle({ match, children }: { match: "home" | "other"; children: ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const show = match === "home" ? isHome : !isHome;
  return <div className={show ? "contents" : "hidden"}>{children}</div>;
}
