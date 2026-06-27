"use client";

import { PriceChart } from "./PriceChart";
import type { PricePoint } from "@/lib/price-history";

// Client wrapper for the index page: the chart's value-formatter is a function,
// which can't be passed across the server→client boundary, so it lives here.
export function IndexChart({ points }: { points: PricePoint[] }) {
  return <PriceChart points={points} fmt={(v) => `${v.toFixed(1)}`} upIsGood />;
}
