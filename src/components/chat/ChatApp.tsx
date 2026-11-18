"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LIMITS, ROOMS, type RoomId } from "@/lib/chat/core";

// Live chat pilot (docs/chat.md). Polls the room's cached read only while this panel is mounted AND the tab is visible, backing off when
// nothing new arrives. Posting needs a signed-in, verified member; reading is public. It never opens by itself and is not in any pop-up.
interface Msg {
  id: string;
  name: string;
  body: string;
  at: string;
}

export function ChatApp({ signedIn }: { signedIn: boolean }) {
  const [room, setRoom] = useState<RoomId>("riftbound");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [on, setOn] = useState(true);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const last = useRef("");
  const idle = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/chat?room=${room}`);
      const j = (await r.json()) as { on: boolean; messages: Msg[] };
      setOn(j.on);
      const tail = j.messages.at(-1)?.id ?? "";
      idle.current = tail === last.current ? Math.min(idle.current + 1, 5) : 0;
      if (tail !== last.current) {
        last.current = tail;
        setMsgs(j.messages);
      }
    } catch {
      /* the next poll tries again */
    }
  }, [room]);

  useEffect(() => {
    setMsgs([]);
    last.current = "";
    idle.current = 0;
    let t: ReturnType<typeof setTimeout>;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") await load();
      // 6 s while it is live, up to 30 s when nothing new has come.
      t = setTimeout(tick, LIMITS.pollMs * (1 + idle.current));
    };
    tick();
    const vis = () => document.visibilityState === "visible" && (idle.current = 0);
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setErr("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room, body: text }) });
      const j = (await r.json()) as { error?: string; message?: Msg };
      if (!r.ok || !j.message) setErr(j.error ?? "Couldn't send that.");
      else {
        setText("");
        last.current = j.message.id;
        idle.current = 0;
        setMsgs((m) => [...m, j.message!].slice(-LIMITS.readTake));
      }
    } catch {
      setErr("Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  async function report(id: string) {
    await fetch("/api/chat/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => undefined);
    setMsgs((m) => m.filter((x) => x.id !== id));
  }

  if (!on) return <p className="rounded-xl border border-white/10 p-4 text-sm opacity-80">Chat is off right now. Check back soon, or use the community forum.</p>;
  return (
    <div className="rounded-xl border border-white/10">
      <div role="tablist" className="flex gap-2 border-b border-white/10 p-2">
        {ROOMS.map((r) => (
          <button key={r.id} role="tab" aria-selected={room === r.id} onClick={() => setRoom(r.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${room === r.id ? "bg-white/15" : "opacity-70"}`}>
            {r.label}
          </button>
        ))}
      </div>
      <div ref={box} aria-live="polite" className="h-[50dvh] overflow-y-auto p-3 text-sm">
        {msgs.length === 0 && <p className="opacity-70">No messages yet. Say hello.</p>}
        {msgs.map((m) => (
          <p key={m.id} className="group mb-2 break-words">
            <span className="font-semibold">{m.name}</span> <span className="opacity-60">{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            {signedIn && (
              <button type="button" onClick={() => report(m.id)} className="ml-2 text-xs opacity-50 hover:opacity-100">
                Report
              </button>
            )}
            <br />
            {m.body}
          </p>
        ))}
      </div>
      {signedIn ? (
        <form onSubmit={send} className="border-t border-white/10 p-2">
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={LIMITS.max} placeholder="Message the room…" aria-label="Message" autoComplete="off" enterKeyHint="send" className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-transparent px-4 text-base" />
            <button type="submit" disabled={sending || !text.trim()} className="h-11 rounded-full bg-white/90 px-5 text-sm font-bold text-black disabled:opacity-50">
              Send
            </button>
          </div>
          {err && <p role="alert" className="mt-1 text-xs text-red-400">{err}</p>}
          <p className="mt-1 text-xs opacity-60">Be kind. No links, no spam. Messages disappear after 7 days.</p>
        </form>
      ) : (
        <p className="border-t border-white/10 p-3 text-sm">
          <a href="/login?next=/chat&src=chat" className="font-semibold underline">Sign in</a> to join the chat. Anyone can read.
        </p>
      )}
    </div>
  );
}
