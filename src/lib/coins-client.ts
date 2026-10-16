"use client";

// RiftCompare Coins, browser side: claim the two tasks only the browser sees
// (sharing a card's price, opening a store's listing). DECISIONS.md,
// "RiftCompare Coins".
//
// Quiet by design. Only a Premium member (the tier /api/me names) sends
// anything, and only while today's local count is under the task's cap, so
// ordinary visitors and capped members send no request at all. The server
// re-checks everything (lib/coins-server.ts claimTask); this is a filter, not
// the rule. Sent as a beacon so a store click that leaves the page still lands.
import { fetchMe } from "./use-me";
import { dayKey, taskById, type TaskId } from "./coins";

const storeKey = (task: TaskId, day: string) => `rc_coins_${task}_${day}`;

export function earnCoin(task: "share" | "visit"): void {
  try {
    const cap = taskById(task)?.perDay ?? 0;
    const day = dayKey(new Date());
    const k = storeKey(task, day);
    let n = 0;
    try {
      n = Number(localStorage.getItem(k) ?? 0) || 0;
    } catch {
      /* storage blocked: the server's cap still holds */
    }
    if (n >= cap) return;
    void fetchMe().then((me) => {
      if (me.tier !== "premium") return;
      try {
        localStorage.setItem(k, String(n + 1));
      } catch {
        /* as above */
      }
      const body = JSON.stringify({ task });
      if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/coins/claim", new Blob([body], { type: "text/plain" }))) return;
      void fetch("/api/coins/claim", { method: "POST", body, keepalive: true }).catch(() => {});
    });
  } catch {
    /* never in the way of a share or a click */
  }
}
