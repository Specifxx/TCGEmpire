"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PremiumButton } from "./PremiumButton";
import { useMe } from "@/lib/use-me";
import { freeLimitHeadline, type FreeLimitKind } from "@/lib/free-limits";
import { PREMIUM_PRICE_LABEL, TIER_NAMES, tierMonthlyAmount } from "@/lib/site";

// THE UPGRADE PROMPT AT THE LIMIT (owner, 2026-09-28: "Put the upgrade prompt
// where people hit a limit — their 11th watchlist card, the 101st portfolio
// card, the Best Basket result — not in popups and headers").
//
// Rendered only as the answer to an add the free account could not make —
// the heart, "Add to collection", the paste import — right where that add was
// tried. Never on a timer, never on page load. It states the real count
// (lib/free-limits.ts), says nothing already tracked is lost, and offers Plus
// (the lowest tier that lifts the limit) through PremiumButton with tier "plus",
// attributed to `limit:watchlist` / `limit:portfolio`.
//
// Gold is only on the button: it is the one Premium action in the panel
// (CURRENT-STATE, "Gold marks Premium").

export function freeLimitPitch(kind: FreeLimitKind, plusOnSale: boolean): string {
  const tier = plusOnSale ? TIER_NAMES.plus : TIER_NAMES.premium;
  const price = plusOnSale ? `${tierMonthlyAmount("plus")}/mo` : PREMIUM_PRICE_LABEL;
  return kind === "watchlist"
    ? `${tier} watches unlimited cards and can email you at your own price — ${price}. Everything you already watch stays.`
    : `${tier} tracks unlimited cards in your portfolio — ${price}. Everything already in it stays and keeps its value.`;
}

export function FreeLimitPanel({
  kind,
  count,
  onClose,
  className = "",
}: {
  kind: FreeLimitKind;
  /** Distinct cards the account holds (the route's `count`). */
  count: number;
  onClose?: () => void;
  className?: string;
}) {
  const { premiumPlus } = useMe();
  return (
    <div role="status" data-free-limit={kind} className={`rounded-xl border border-ink-600 bg-ink-900 p-3 text-left ${className}`}>
      <p className="text-sm font-semibold text-white">{freeLimitHeadline(kind, count)}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-300">{freeLimitPitch(kind, premiumPlus)}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PremiumButton tier="plus" surface={`limit:${kind}`} />
        {onClose && (
          <button type="button" onClick={onClose} className="tap-link text-xs text-slate-400 hover:text-white">
            Not now
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The same panel for a control too small to hold it (a tile's heart): shown
 * beside the control that was just tapped, closed by Escape, an outside tap or
 * a scroll. Portalled, so a tile's overflow can't clip it.
 */
export function FreeLimitPopover({
  anchor,
  kind,
  count,
  onClose,
}: {
  anchor: HTMLElement | null;
  kind: FreeLimitKind;
  count: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const WIDTH = 288;

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const left = Math.max(16, Math.min(vw - WIDTH - 16, r.right - WIDTH));
    setPos({ top: r.bottom + 8, left });
  }, [anchor]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const scroll = () => onClose();
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", down);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("scroll", scroll);
    };
  }, [anchor, onClose]);

  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, width: WIDTH }} className="z-50 shadow-2xl">
      <FreeLimitPanel kind={kind} count={count} onClose={onClose} />
    </div>,
    document.body,
  );
}
