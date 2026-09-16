"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import { formatMoneyCompact } from "@/lib/format";
import { currencyOf } from "@/lib/country";
import { Skeleton } from "./ui/Skeleton";

// Real numbers above the pricing cards, not a made-up urgency line — the same
// cached feed PremiumSlideIn's proof line reads (api/premium/proof), so this
// adds no server work beyond what the homepage already pays for. Renders
// nothing until the fetch resolves, and nothing at all if there's too little
// to make a real case or the fetch fails — this can only make the pitch
// stronger, never weaker.
export function PremiumProofLine() {
  const { country } = useCountry();
  const [proof, setProof] = useState<{ deals: number; savingsCents: number } | null>(null);
  const [settled, setSettled] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    let cancelled = false;
    fetch(`/api/premium/proof?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        if (typeof d.deals === "number" && typeof d.savingsCents === "number") {
          setProof({ deals: d.deals, savingsCents: d.savingsCents });
        }
      })
      .catch(() => {
        /* best-effort — no proof line is a fine fallback */
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [country]);

  if (proof === null && !settled) {
    return <Skeleton className="mx-auto mt-4 h-4 w-64" />;
  }
  if (!proof || proof.deals < 5) return null;

  return (
    <p className="mt-4 text-center text-sm text-slate-400">
      <span className="font-bold text-white">
        {proof.deals} deals worth {formatMoneyCompact(proof.savingsCents, currencyOf(country))}
      </span>{" "}
      live on Deal Finder right now.
    </p>
  );
}
