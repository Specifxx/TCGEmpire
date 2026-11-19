"use client";

import { useEffect } from "react";
import { applyEbayBtn } from "@/lib/ebay-btn";

/** Assigns the eBay-button A/B arm and sets `<html data-ebaybtn>` (lib/ebay-btn.ts). Renders nothing. */
export function EbayBtnArm() {
  useEffect(() => applyEbayBtn(), []);
  return null;
}
