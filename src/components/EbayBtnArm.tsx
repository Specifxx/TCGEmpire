"use client";

import { useEffect } from "react";
import { applyEbayBtn } from "@/lib/ebay-btn";
import { applyEbayPop } from "@/lib/ebay-pop";

/** Sets `<html data-ebaybtn>` (lib/ebay-btn.ts) and assigns the eBay stand-out A/B arm, `<html data-ebaypop>` (lib/ebay-pop.ts). Renders nothing. */
export function EbayBtnArm() {
  useEffect(() => {
    applyEbayBtn();
    applyEbayPop();
  }, []);
  return null;
}
