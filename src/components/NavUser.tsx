"use client";

import { UserMenu } from "./UserMenu";
import { useMe } from "@/lib/use-me";

// Client shell around UserMenu: fetches the session via
// /api/me after mount so the Navbar (and therefore every page) can be
// server-rendered without reading the session cookie — the read that used to
// force the whole site dynamic. Renders a fixed-size placeholder until the
// session resolves so a signed-in user never sees the signed-out icon flash.
// The bell only renders once signed in — notifications are account-bound.
export function NavUser() {
  const { user, loaded } = useMe();
  if (!loaded) return <div aria-hidden className="h-11 w-11 sm:h-9 sm:w-9" />;
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
