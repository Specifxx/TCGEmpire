"use client";

import { useEffect, useId, useState } from "react";
import { useMe } from "@/lib/use-me";
import { currencyOf, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { FREE_ALERT_IN_USE, targetAlertLimit } from "@/lib/alert-limits";
import { centsToInput, clampTargetCents, parseMoneyInput } from "@/lib/target-price";
import { PremiumButton } from "./PremiumButton";
import { ENTRY_TIER_NAME } from "@/lib/site";

// "NOTIFY ME AT $__" — the target price on one watch (2026-09-25 lineup; one
// for a free account since 2026-10-23, DECISIONS.md "Free accounts get one
// alert").
// Rendered on each /watching tile, each watchlist-drawer row, and in the
// PriceAlertModal once a signed-in watch exists.
//
//   • Plus / Premium: a money input in the WATCH'S OWN market currency (a card
//     watched in AU takes A$, whatever market the viewer is browsing). Saves
//     via PATCH /api/alerts/watchlist/[cardId] on blur or Enter; an empty field
//     clears the target. A typo is clamped on blur to what the route accepts
//     (lib/target-price.ts), so the saved number is always the one on screen.
//     Plus shows "N of 25 used" (lib/alert-limits.ts, the same constant the
//     route enforces): from the parent when it has the rows (the watchlist),
//     otherwise fetched once (GET /api/alerts/watchlist?targets=1 — the modal),
//     so the at-limit state shows before a save rather than as a 409 after it.
//   • A target the account holds beyond its tier's limit (a Premium member
//     who moved to Plus) is stored but not emailed on: the parent passes
//     active={false} (lib/target-price.ts honouredTargetIds, the cron's own
//     rule) and the field says so instead of promising an email.
//   • A free account gets the SAME working field for its one target
//     (FREE_TARGET_ALERT_LIMIT), with "N of 1 used". Only once that one is in
//     use, on another card, is the field disabled with the upgrade beside it
//     (PremiumButton, surface gate:target-limit) — and the route's 402 says
//     the same if the count was stale.
//   • Signed out: nothing (the parents only render it for accounts).
export function TargetPriceField({
  cardId,
  cardName,
  market,
  initialCents,
  used,
  active = true,
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
  /** false: this watch's target is over the account's limit, so the cron skips it. */
  active?: boolean;
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

  // A free account is tier null: its one target.
  const limit = targetAlertLimit(premium ? tier : null);
  const finiteLimit = Number.isFinite(limit) ? limit : null;

  // No count from the parent (the alert modal): ask for it, once, and only
  // when there is a count to show — a free account or a Plus member. Premium
  // has no limit, so it costs no request.
  const needCount = used === undefined && loaded && !!user && finiteLimit != null;
  useEffect(() => {
    if (!needCount) return;
    let cancelled = false;
    fetch("/api/alerts/watchlist?targets=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { used?: number | null } | null) => {
        if (!cancelled && typeof d?.used === "number") setUsedNow(d.used);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needCount]);

  if (!loaded || !user) return null;
  // At the limit, on a watch with no target yet (a free account's one is on
  // another card, or Plus's 25 are in use): the field would only be refused, so
  // say so and offer the tier that lifts it.
  const atLimit = finiteLimit != null && usedNow != null && usedNow >= finiteLimit && saved == null;

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
    const data = (await res?.json().catch(() => null)) as { used?: number; error?: string; code?: string } | null;
    if (res?.ok) {
      setSaved(cents);
      setStatus("saved");
      if (typeof data?.used === "number") setUsedNow(data.used);
      onSaved?.(cents, typeof data?.used === "number" ? data.used : null);
    } else {
      // Put the last saved value back, so the field never shows a number that
      // isn't the one we'll alert on.
      setText(centsToInput(saved));
      // The free alert is in use elsewhere (a stale count): show the upgrade line.
      if (res?.status === 402 && typeof data?.used === "number") {
        setUsedNow(data.used);
        setStatus("idle");
        return;
      }
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

  const disabled = atLimit || status === "saving";

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
        {atLimit && !premium ? (
          <>
            {FREE_ALERT_IN_USE}{" "}
            <span onClickCapture={onUpgradeClick}>
              <PremiumButton surface="gate:target-limit" className="font-semibold text-gold underline-offset-2 hover:underline">
                See {ENTRY_TIER_NAME}
              </PremiumButton>
            </span>
          </>
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
                  ? premium
                    ? "Leave empty for new-low and below-market alerts only."
                    : "Your free target-price alert: we email you when a store has it at your price."
                  : !active
                    ? premium
                      ? "Not active: over your Plus limit. Clear another target to switch this one on."
                      : "Not active: your free alert is on another card. Clear that one to switch this on."
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
