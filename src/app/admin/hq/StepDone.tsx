"use client";

import { useState } from "react";

// Empire HQ's Done button for one of the owner's queued steps (POST /api/admin/hq/steps).
export function StepDone({ id, done }: { id: string; done: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [isDone, setDone] = useState(done);
  async function toggle() {
    setState("saving");
    try {
      const res = await fetch("/api/admin/hq/steps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, done: !isDone }) });
      if (!res.ok) throw new Error(String(res.status));
      setDone(!isDone);
      setState("idle");
    } catch {
      setState("error");
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "saving"}
      className={`shrink-0 rounded-lg border px-3 py-1 text-xs font-bold ${isDone ? "border-ink-600 text-slate-400 hover:text-white" : "border-brand-500 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20"}`}
    >
      {state === "saving" ? "Saving…" : state === "error" ? "Failed, retry" : isDone ? "Undo" : "Done"}
    </button>
  );
}
