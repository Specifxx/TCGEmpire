"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { adFreePath } from "@/lib/ad-free-paths";

/** Renders its ads everywhere except the ad-free pages (lib/ad-free-paths.ts): Premium, account, sign-in, collection, watches, giveaway. */
export function AdRouteGate({ children }: { children: ReactNode }) {
  return adFreePath(usePathname()) ? null : <>{children}</>;
}
