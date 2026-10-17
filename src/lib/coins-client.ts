"use client";

// Riftcoins, browser side: claim the tasks only the browser sees — sharing a
// card's price, opening a store's listing, finishing an arcade game.
// DECISIONS.md, "RiftCompare Coins" and "Riftcoins".
//
// Quiet by design. Only a signed-in member (/api/me names one) sends anything,
// and only while today's local count is under the task's cap (for a game, until
// that game has paid today), so signed-out visitors and capped members send no
// request at all. The server re-checks everything (lib/coins-server.ts
// claimTask); this is a filter, not the rule. Sent as a beacon so a store click
// that leaves the page still lands.
import { fetchMe } from "./use-me";
import { dayKey, taskById, type ArcadeGame, type TaskId } from "./coins";

const storeKey = (name: string, day: string) => `rc_coins_${name}_${day}`;

function readCount(k: string): number {
  try {
    return Number(localStorage.getItem(k) ?? 0) || 0;
  } catch {
    return 0; // storage blocked: the server's cap still holds
  }
}

function send(k: string, n: number, body: { task: TaskId; game?: ArcadeGame }): void {
  void fetchMe().then((me) => {
    if (!me.user) return;
    try {
      localStorage.setItem(k, String(n + 1));
    } catch {
      /* as above */
    }
    const json = JSON.stringify(body);
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/coins/claim", new Blob([json], { type: "text/plain" }))) return;
    void fetch("/api/coins/claim", { method: "POST", body: json, keepalive: true }).catch(() => {});
  });
}

export function earnCoin(task: "share" | "visit"): void {
  try {
    const k = storeKey(task, dayKey(new Date()));
    const n = readCount(k);
    if (n >= (taskById(task)?.perDay ?? 0)) return;
    send(k, n, { task });
  } catch {
    /* never in the way of a share or a click */
  }
}

/** A game just ended: pays once per game per day. Call it from the game-over moment. */
export function earnArcade(game: ArcadeGame): void {
  try {
    const k = storeKey(`arcade_${game}`, dayKey(new Date()));
    if (readCount(k) >= 1) return;
    send(k, 0, { task: "arcade", game });
  } catch {
    /* never in the way of a game */
  }
}
