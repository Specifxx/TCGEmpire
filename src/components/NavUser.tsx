"use client";

import { UserMenu } from "./UserMenu";
import { useMe } from "@/lib/use-me";

// Client shell around UserMenu: fetches the session via
// /api/me after mount so the Navbar (and therefore every page) can be
// server-rendered without reading the session cookie — the read that used to
// force the whole site dynamic. Renders a fixed-size, empty placeholder until
// the session resolves so a signed-in user never sees the signed-out icon
// flash. The bell only renders once signed in — notifications are account-bound.
//
// THE PLACEHOLDER IS SIZED FOR THE SIGNED-OUT CONTROL (2026-09-23), because
// signed-out visitors are the majority. It was `h-11 w-11 sm:h-9 sm:w-9`, 36px
// wide from sm, which then became the 115px "Log in / Sign up" CTA, so every
// control to its left jumped once per page load: the market trigger moved
// -79px at 640, 844x390 and 1440 (and -4px at 390, where the coarse icon is
// 48px). Below sm `tap-icon` is exactly the icon it becomes (44px, 48px on a
// coarse pointer); from sm, 7.25rem (116px) reserves the CTA's measured 115px.
// `sm:w-[…]` is a responsive utility emitted after both tap-icon's own sm:w-9
// and the coarse `.tap-icon{width:48px}`, so it wins. Trade-off, accepted:
// returning signed-in visitors see one ~80px shift the other way.
export function NavUser() {
  const { user, loaded } = useMe();
  if (!loaded) return <div aria-hidden className="tap-icon sm:h-9 sm:w-[7.25rem]" />;
  return (
    <>
      {/* THE NOTIFICATION BELL IS GONE FROM THE HEADER ENTIRELY (2026-09-19),
          not just hidden below sm as it had been since "get rid of the
          notification icon so we make more space for the profile icon". Asked
          for directly alongside bringing the Database link back: this row could
          not carry both, and Database is the more valuable of the two.

          It also ends an ambiguity: HeaderWatchButton draws a heart for the
          watchlist, and between sm and lg a signed-in visitor saw two bells
          side by side, distinguishable only by fill and badge.

          WHAT THIS COSTS, stated plainly because nothing replaces it:
          NotificationBell was an in-place dropdown with no page equivalent —
          there is no /notifications route — so unread notifications currently
          have no surface at all. The component and use-unread.ts are left in
          the tree deliberately; if notifications matter, the fix is a real page
          linked from the menu overlay, not squeezing the bell back into a row
          that has already lost this argument twice. */}
      <UserMenu user={user} />
    </>
  );
}
