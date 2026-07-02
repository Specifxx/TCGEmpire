"use client";

import { UserMenu } from "./UserMenu";
import { WishlistSync } from "./WishlistSync";
import { useMe } from "@/lib/use-me";

// Client shell around UserMenu + WishlistSync: fetches the session via /api/me
// after mount so the Navbar (and therefore every page) can be server-rendered
// without reading the session cookie — the read that used to force the whole
// site dynamic. Renders a fixed-size placeholder until the session resolves so
// a signed-in user never sees the signed-out icon flash; WishlistSync mounts
// only once the loggedIn flag is known, so it never sees a false→true flip.
export function NavUser() {
  const { user, loaded } = useMe();
  if (!loaded) return <div aria-hidden className="h-9 w-9" />;
  return (
    <>
      <WishlistSync loggedIn={!!user} />
      <UserMenu user={user} />
    </>
  );
}
