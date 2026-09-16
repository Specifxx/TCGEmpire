"use client";

import { UserMenu } from "./UserMenu";
import { NotificationBell } from "./NotificationBell";
import { useMe } from "@/lib/use-me";

// Client shell around UserMenu + NotificationBell: fetches the session via
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
      {/* Bell hidden below sm: reported directly — "get rid of the
          notification icon so we make more space for the profile icon" on
          phones, where the header row is already tight (see Navbar.tsx's own
          breakpoint history). Still reachable from sm up; the shared poll in
          use-unread.ts is unaffected either way (one interval regardless of
          how many components read it, or whether they're visible). */}
      {user && (
        <span className="hidden sm:inline-flex">
          <NotificationBell />
        </span>
      )}
      <UserMenu user={user} />
    </>
  );
}
