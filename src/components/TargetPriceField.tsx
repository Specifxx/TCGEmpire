"use client";

import { useEffect, useId, useState } from "react";
import { useMe } from "@/lib/use-me";
import { currencyOf, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { targetAlertLimit } from "@/lib/alert-limits";
import { centsToInput, clampTargetCents, parseMoneyInput } from "@/lib/target-price";
import { PremiumButton } from "./PremiumButton";

// "NOTIFY ME AT $__" — the Plus target price on one watch (2026-09-25 lineup).
// Rendered on each /watching tile, each watchlist-drawer row, and in the
// PriceAlertModal once a signed-in watch exists.
//
//   • Plus / Premium: a money input in the WATCH'S OWN market currency (a card
//     watched in AU takes A$, whatever market the viewer is browsing). Saves
//     via PATCH /api/alerts/watchlist/[cardId] on blur or Enter; an empty field
//     clears the target. A typo is clamped on blur to what the route accepts
//     (lib/target-price.ts), so the saved number is always the one on screen.
//     Plus shows "N of 25 used" (lib/alert-limits.ts, the same constant the
//     route enforces).
//   • A free account sees the same field DISABLED with the Plus gate beside it
//     — the feature is visible where it would be used, never a dead end.
//   • Signed out: nothing (the parents only render it for accounts).
export function TargetPriceField({
  cardId,
  cardName,
  market,
  initialCents,
  used,
  onSaved,
  onUpgradeClick,
  className,
}: {
  cardId: string;
  cardName: string;
  market: string;
  initialCents: number | null;
  /** How many of this account's watches carry a target, when the parent knows. */
  used?: number;
  onSaved?: (targetCents: number | null, used: number | null) => void;
  /** The gate's button was pressed — a parent modal closes itself first. */
  onUpgradeClick?: () => void;
  className?: string;
}) {
  const { user, premium, tier, loaded } = useMe();
  const id = useId();
  const currency = currencyOf(market as Country);
  // The market's own symbol ("US$", "A$", "£"…), from the one formatter.
  const symbol = formatMoney(0, currency).replace(/[\d.,\s]/g, "");

  const [saved, setSaved] = useState<number | null>(initialCents);
  const [text, setText] = useState(centsToInput(initialCents));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [usedNow, setUsedNow] = useState<number | null>(used ?? null);
  useEffect(() => {
    if (used != null) setUsedNow(used);
  }, [used]);

  if (!loaded || !user) return null;

  const limit = targetAlertLimit(tier);
  const finiteLimit = Number.isFinite(limit) ? limit : null;
  // A Plus member at the limit, on a watch with no target yet: the field would
  // only 409, so say so and offer the tier that lifts it.
  const atLimit = premium && finiteLimit != null && usedNow != null && usedNow >= finiteLimit && saved == null;

  async function save(cents: number | null) {
    if (cents === saved) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    setError(null);
    const res = await fetch(`/api/alerts/watchlist/${encodeURIComponent(cardId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ market, targetCents: cents }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { used?: number; error?: string } | null;
    if (res?.ok) {
      setSaved(cents);
      setStatus("saved");
      if (typeof data?.used === "number") setUsedNow(data.used);
      onSaved?.(cents, typeof data?.used === "number" ? data.used : null);
    } else {
      // Put the last saved value back, so the field never shows a number that
      // isn't the one we'll alert on.
      setText(centsToInput(saved));
      setStatus("error");
      setError(data?.error ?? "Couldn't save that — try again.");
    }
  }

  function commit() {
    const parsed = parseMoneyInput(text);
    const cents = parsed == null ? null : clampTargetCents(parsed);
    setText(centsToInput(cents));
    void save(cents);
  }

  const disabled = !premium || atLimit || status === "saving";

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        <label htmlFor={id} className="text-xs font-semibold text-slate-300">
          Notify me at
        </label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500" aria-hidden>
            {symbol}
          </span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="__"
            value={text}
            disabled={disabled}
            aria-label={`Notify me when ${cardName} is at or below this price, in ${currency}`}
            aria-describedby={`${id}-note`}
            onChange={(e) => {
              setText(e.target.value);
              if (status !== "saving") setStatus("idle");
            }}
            onBlur={() => {
              if (!disabled) commit();
            }}
            className="input w-24 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </form>
      <p id={`${id}-note`} className="mt-1 text-[11px] leading-snug text-slate-500" aria-live="polite">
        {!premium ? (
          <span onClickCapture={onUpgradeClick}>
            <PremiumButton
              tier="plus"
              surface="gate:target-alert"
              className="font-semibold text-gold underline-offset-2 hover:underline"
            >
              Set your own price with Plus
            </PremiumButton>
          </span>
        ) : atLimit ? (
          <>
            All {finiteLimit} target prices are in use — clear one, or{" "}
            <span onClickCapture={onUpgradeClick}>
              <PremiumButton surface="gate:target-limit" className="font-semibold text-gold underline-offset-2 hover:underline">
                go unlimited with Premium
              </PremiumButton>
            </span>
            .
          </>
        ) : status === "error" ? (
          <span className="text-down">{error}</span>
        ) : (
          <>
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? saved == null
                  ? "Target cleared."
                  : `Saved. We'll email you, naming the store, when it's ${formatMoney(saved, currency)} or less.`
                : saved == null
                  ? "Leave empty for new-low alerts only."
                  : "We email you, naming the store, when it's at or below this."}
            {finiteLimit != null && usedNow != null && (
              <span className="num"> · {usedNow} of {finiteLimit} used</span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
