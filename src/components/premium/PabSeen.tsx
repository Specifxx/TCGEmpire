"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { pabKey } from "@/lib/premium-ab";

/** pab_seen {pk}: the exposure event of a /premium test, once per mount, only inside the test's window. */
export function PabSeen() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const pk = pabKey();
    if (pk) trackEvent("pab_seen", { pk });
  }, []);
  return null;
}
