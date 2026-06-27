"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The desktop left rail is great on tool/browse pages, but it crowds the cinematic
// homepage. Hide it on "/" so the hero gets a clean, centered, full-bleed canvas;
// the same navigation is surfaced there by the ToolDeck section instead.
export function SideNavGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <>{children}</>;
}
