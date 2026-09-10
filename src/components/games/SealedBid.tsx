"use client";

// Sealed Bid — the client for the multiplayer blind auction. Thin by design:
// every rule is judged on the server (lib/sealed-bid-engine.ts) and this file
// only renders `SbView` and sends actions. State arrives by polling — no
// websockets on this host — and the round clock is driven off the server's
// `phaseEndsAt` with a measured offset, so six phones show the same countdown.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { DOMAINS, type DomainKey } from "@/lib/constants";
import { SB, type SbStanding, type SbView, type SbViewCard } from "@/lib/sealed-bid-engine";
import { useShare } from "./shared";

type Session = { code: string; token: string; pid: string };
type Poll = { view: SbView; share: string | null };

const LS_NAME = "rc_sb_name";
const LS_LAST = "rc_sb_last";
const roomKey = (code: string) => `rc_sb_room_${code}`;
const BASE = "/api/games/sealed-bid";

function ls(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* storage unavailable */
  }
}

async function api<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "x-sb-token": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong — try again.") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

const fmt = (n: number) => n.toLocaleString();

// ── Root ─────────────────────────────────────────────────────────────────────

export function SealedBid() {
  const [session, setSession] = useState<Session | null>(null);
  const [booted, setBooted] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefillCode, setPrefillCode] = useState("");
  const [name, setName] = useState("");
  const offset = useRef(0); // serverNow - clientNow, refreshed on every poll
  const [now, setNow] = useState(() => Date.now());

  // Boot: resume the room in the URL (?room=) or the last room we were in.
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = (url.searchParams.get("room") ?? "").toUpperCase();
    setName(ls(LS_NAME) ?? "");
    const tryResume = (code: string): boolean => {
      const raw = ls(roomKey(code));
      if (!raw) return false;
      try {
        const { token, pid } = JSON.parse(raw) as { token: string; pid: string };
        if (token && pid) {
          setSession({ code, token, pid });
          return true;
        }
      } catch {
        /* corrupt */
      }
      return false;
    };
    if (fromUrl && tryResume(fromUrl)) {
      /* resumed */
    } else if (fromUrl) {
      setPrefillCode(fromUrl);
    } else {
      const last = ls(LS_LAST);
      if (last) tryResume(last);
    }
    setBooted(true);
  }, []);

  // Keep the URL shareable / refresh-safe.
  useEffect(() => {
    if (!booted) return;
    const url = new URL(window.location.href);
    if (session) url.searchParams.set("room", session.code);
    else url.searchParams.delete("room");
    window.history.replaceState(null, "", url.toString());
  }, [session, booted]);

  const enter = useCallback((s: Session) => {
    lsSet(roomKey(s.code), JSON.stringify({ token: s.token, pid: s.pid }));
    lsSet(LS_LAST, s.code);
    setError(null);
    setSession(s);
  }, []);

  const exit = useCallback((msg?: string) => {
    setSession(null);
    setPoll(null);
    lsSet(LS_LAST, null);
    if (msg) setError(msg);
  }, []);

  const applyPoll = useCallback((p: Poll) => {
    offset.current = p.view.serverNow - Date.now();
    setPoll(p);
  }, []);

  // The poll loop. Faster while a round is live, slower in the lobby, paused
  // while the tab is hidden (the server's clock runs on regardless).
  useEffect(() => {
    if (!session) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const phase = poll?.view.phase;
    const delay = phase === "bidding" || phase === "reveal" ? 1500 : phase === "over" ? 4000 : 2500;

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "hidden") {
        timer = setTimeout(tick, 3000);
        return;
      }
      try {
        const p = await api<Poll>(`${BASE}/${session.code}`, session.token);
        if (!alive) return;
        applyPoll(p);
        if (!p.view.you) {
          exit("You're no longer in that room.");
          return;
        }
      } catch (e) {
        if (!alive) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          exit("That room has expired.");
          return;
        }
      }
      timer = setTimeout(tick, delay);
    };
    tick();
    const onVis = () => {
      if (document.visibilityState === "visible" && timer) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, poll?.view.phase]);

  // Local clock for the countdowns.
  const live = poll?.view.phase === "bidding" || poll?.view.phase === "reveal";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [live]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      try {
        const p = await api<Poll>(`${BASE}/${session.code}`, session.token, body);
        applyPoll(p);
        return p;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [session, applyPoll]
  );

  const create = async (opts: { name: string; rounds: number; timerSec: number }) => {
    setBusy(true);
    setError(null);
    try {
      lsSet(LS_NAME, opts.name);
      setName(opts.name);
      const r = await api<{ code: string; token: string; pid: string; view: SbView }>(BASE, null, opts);
      enter({ code: r.code, token: r.token, pid: r.pid });
      applyPoll({ view: r.view, share: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (code: string, nm: string) => {
    setBusy(true);
    setError(null);
    try {
      lsSet(LS_NAME, nm);
      setName(nm);
      const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
      // Send the identity we already hold for this room (or our current one —
      // a rematch room carries the host over under the same token). The server
      // hands the SAME player back instead of seating a duplicate.
      let hint: string | null = null;
      try {
        const raw = ls(roomKey(clean));
        if (raw) hint = (JSON.parse(raw) as { token?: string }).token ?? null;
      } catch {
        /* corrupt */
      }
      hint = hint ?? session?.token ?? null;
      const r = await api<{ token: string; pid: string; view: SbView }>(`${BASE}/${clean}`, hint, { action: "join", name: nm });
      enter({ code: clean, token: r.token, pid: r.pid });
      applyPoll({ view: r.view, share: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = async () => {
    if (!session) return;
    if (poll?.view.phase === "lobby") await act({ action: "leave" });
    lsSet(roomKey(session.code), null);
    exit();
  };

  if (!booted) return <Shell><div className="card-surface grid min-h-[280px] place-items-center p-8 text-sm text-slate-500">Loading…</div></Shell>;

  if (!session) {
    return (
      <Shell>
        <Landing name={name} prefillCode={prefillCode} busy={busy} error={error} onCreate={create} onJoin={joinRoom} />
      </Shell>
    );
  }

  const view = poll?.view;
  if (!view) {
    return (
      <Shell code={session.code}>
        <div className="card-surface grid min-h-[280px] place-items-center p-8 text-center">
          <div className="animate-pulse text-sm text-slate-500">Joining room {session.code}…</div>
        </div>
      </Shell>
    );
  }

  const remainingMs = view.phaseEndsAt != null ? Math.max(0, view.phaseEndsAt - (now + offset.current)) : 0;

  return (
    <Shell code={view.code} round={view.phase === "bidding" || view.phase === "reveal" ? `${view.round + 1}/${view.totalRounds}` : undefined}>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {view.phase === "lobby" && <Lobby view={view} busy={busy} onStart={() => act({ action: "start" })} onLeave={leaveRoom} />}
      {view.phase === "bidding" && (
        <Auction
          key={view.round}
          view={view}
          remainingMs={remainingMs}
          busy={busy}
          onBid={(card, amount, surge) => act({ action: "bid", card, amount, surge })}
          onAppraise={(card) => act({ action: "appraise", card })}
        />
      )}
      {view.phase === "reveal" && <Reveal view={view} remainingMs={remainingMs} />}
      {view.phase === "over" && (
        <Final
          view={view}
          share={poll?.share ?? null}
          busy={busy}
          onRematch={() => act({ action: "rematch" })}
          onJoinRematch={(code) => joinRoom(code, view.you?.name ?? name)}
          onExit={() => {
            lsSet(roomKey(session.code), null);
            exit();
          }}
        />
      )}
    </Shell>
  );
}

// ── Chrome ───────────────────────────────────────────────────────────────────

function Shell({ code, round, children }: { code?: string; round?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      {/* No breadcrumb here: the page renders <Breadcrumbs> (with the
          BreadcrumbList JSON-LD), same as every other arcade game. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white">
            <span aria-hidden>🔨</span> Sealed Bid
          </h1>
          <p className="mt-1 text-sm text-slate-400">The multiplayer blind auction where nobody sees the price.</p>
        </div>
        {code && (
          <div className="text-right text-xs text-slate-400">
            Room <span className="num font-bold text-white">{code}</span>
            {round && <span className="ml-2">· Round <span className="font-bold text-white">{round}</span></span>}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Landing: create or join ──────────────────────────────────────────────────

function Landing({
  name: initialName,
  prefillCode,
  busy,
  error,
  onCreate,
  onJoin,
}: {
  name: string;
  prefillCode: string;
  busy: boolean;
  error: string | null;
  onCreate: (o: { name: string; rounds: number; timerSec: number }) => void;
  onJoin: (code: string, name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(prefillCode);
  const [rounds, setRounds] = useState<number>(SB.DEFAULT_ROUNDS);
  const [timerSec, setTimerSec] = useState<number>(SB.DEFAULT_TIMER);
  const [tab, setTab] = useState<"join" | "create">(prefillCode ? "join" : "create");
  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => {
    if (prefillCode) {
      setCode(prefillCode);
      setTab("join");
    }
  }, [prefillCode]);

  const nameOk = name.trim().length >= SB.NAME_MIN;

  return (
    <div className="grid gap-4">
      <div className="card-surface overflow-hidden">
        <div className="grid grid-cols-2 border-b border-ink-800 text-sm font-semibold">
          <button
            onClick={() => setTab("create")}
            className={`min-h-11 px-4 ${tab === "create" ? "bg-ink-850 text-white" : "text-slate-400 hover:text-slate-200"}`}
            aria-pressed={tab === "create"}
          >
            🆕 Host a room
          </button>
          <button
            onClick={() => setTab("join")}
            className={`min-h-11 px-4 ${tab === "join" ? "bg-ink-850 text-white" : "text-slate-400 hover:text-slate-200"}`}
            aria-pressed={tab === "join"}
          >
            🔗 Join with a code
          </button>
        </div>
        <div className="p-4 sm:p-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="sb-name">Your name</label>
          <input
            id="sb-name"
            className="input mt-1"
            value={name}
            maxLength={SB.NAME_MAX}
            placeholder="e.g. Jinx Main"
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
          />

          {tab === "create" ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rounds</legend>
                  <div className="mt-1 flex gap-1.5">
                    {SB.ROUND_OPTIONS.map((r) => (
                      <button key={r} onClick={() => setRounds(r)} aria-pressed={rounds === r} className={`chip min-h-9 flex-1 justify-center border ${rounds === r ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-300"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seconds per round</legend>
                  <div className="mt-1 flex gap-1.5">
                    {SB.TIMER_OPTIONS.map((t) => (
                      <button key={t} onClick={() => setTimerSec(t)} aria-pressed={timerSec === t} className={`chip min-h-9 flex-1 justify-center border ${timerSec === t ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-300"}`}>
                        {t}s
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <button
                disabled={busy || !nameOk}
                onClick={() => onCreate({ name: name.trim(), rounds, timerSec })}
                className="btn-primary mt-4 w-full"
              >
                {busy ? "Opening room…" : "Open a room →"}
              </button>
              <p className="mt-2 text-center text-xs text-slate-500">You&apos;ll get a 6-letter code and a link to send to {SB.MIN_PLAYERS - 1}–{SB.MAX_PLAYERS - 1} friends. No accounts needed.</p>
            </>
          ) : (
            <>
              <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="sb-code">Room code</label>
              <input
                id="sb-code"
                className="input num mt-1 uppercase tracking-[0.3em]"
                value={code}
                maxLength={6}
                placeholder="ABC123"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                disabled={busy || !nameOk || code.replace(/[^A-Z0-9]/g, "").length !== 6}
                onClick={() => onJoin(code, name.trim())}
                className="btn-primary mt-4 w-full"
              >
                {busy ? "Joining…" : "Join room →"}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Three cards, prices hidden">Every round three real Riftbound cards go under the hammer. You see the art and stats — never the live price.</Step>
        <Step n={2} title="One sealed bid">Everyone secretly bids Shards on one card. Highest wins and pays. A tie SHATTERS the card and burns half of each tied bid.</Step>
        <Step n={3} title="Appraise the vault">After the last round your cards are appraised at real market value. Add half your unspent Shards and set bonuses. Richest vault wins.</Step>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-300">{n}</span>
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}

// ── Lobby ────────────────────────────────────────────────────────────────────

function Lobby({ view, busy, onStart, onLeave }: { view: SbView; busy: boolean; onStart: () => void; onLeave: () => void }) {
  const { copied, share } = useShare();
  const me = view.players.find((p) => p.isYou);
  const isHost = !!me?.isHost;
  const link = typeof window !== "undefined" ? `${window.location.origin}/games/sealed-bid?room=${view.code}` : "";
  const canStart = view.players.length >= view.minPlayers;

  const nativeShare = async () => {
    const text = `Join my Sealed Bid room — code ${view.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Sealed Bid", text, url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    share(`${text}\n${link}`);
  };

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <div className="card-surface p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Room code</p>
        <p className="num mt-1 text-5xl font-extrabold tracking-[0.25em] text-white">{view.code}</p>
        <p className="mt-2 text-sm text-slate-400">
          Send this to your friends. They open <span className="text-slate-200">riftcompare.com/games/sealed-bid</span> and type it in — or use the link.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={nativeShare} className="btn-primary text-sm">{copied ? "Copied ✓" : "Share invite link"}</button>
          <button onClick={() => share(link)} className="btn-ghost text-sm">{copied ? "Copied ✓" : "Copy link"}</button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-xs text-slate-400">
          <Stat label="Rounds" value={String(view.totalRounds)} />
          <Stat label="Per round" value={`${view.timerSec}s`} />
          <Stat label="Budget" value={`${fmt(view.startShards)} ◈`} />
        </div>
        <div className="mt-5">
          {isHost ? (
            <>
              <button disabled={busy || !canStart} onClick={onStart} className="btn-primary w-full sm:w-auto sm:min-w-[220px]">
                {busy ? "Dealing…" : canStart ? `Start with ${view.players.length} players →` : `Waiting for players (${view.players.length}/${view.minPlayers})`}
              </button>
              <p className="mt-2 text-xs text-slate-500">Prices are taken from the {view.country} market ({view.currency}) — the same live data as the rest of RiftCompare.</p>
            </>
          ) : (
            <p className="animate-pulse text-sm text-slate-300">Waiting for the host to start…</p>
          )}
        </div>
      </div>
      <div className="grid gap-3">
        <Players view={view} />
        <button onClick={onLeave} className="btn-ghost text-sm">Leave room</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950/60 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="num mt-0.5 text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function Players({ view }: { view: SbView }) {
  const bidding = view.phase === "bidding";
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Players</h2>
        <span className="text-[11px] text-slate-500">{view.players.length}/{view.maxPlayers}</span>
      </div>
      <ul className="divide-y divide-ink-800">
        {view.players.map((p) => (
          <li key={p.pid} className={`flex items-center gap-2 px-3 py-2 text-sm ${p.isYou ? "bg-brand-500/10" : ""}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${p.online ? "bg-brand-400" : "bg-ink-700"}`} title={p.online ? "online" : "away"} />
            <span className={`min-w-0 flex-1 truncate ${p.isYou ? "font-bold text-white" : "text-slate-200"}`}>
              {p.isHost && <span title="host" aria-label="host">👑 </span>}
              {p.name}
              {p.isYou && <span className="text-slate-500"> (you)</span>}
            </span>
            {view.phase !== "lobby" && (
              <span className="num shrink-0 text-xs text-slate-400" title="Shards left · cards in vault">
                {fmt(p.shards)} ◈ · {p.vaultCount}🃏
              </span>
            )}
            {bidding && (
              <span className={`shrink-0 text-xs ${p.sealed ? "text-brand-300" : "text-slate-600"}`} title={p.sealed ? "bid sealed" : "thinking"}>
                {p.sealed ? "🔒" : "…"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Card tile ────────────────────────────────────────────────────────────────

function domainStyle(domain: string) {
  const d = DOMAINS[domain as DomainKey];
  return d ? { backgroundColor: d.color2, color: d.text, borderColor: d.color } : undefined;
}

const RARITY_CLASS: Record<string, string> = {
  Common: "border-ink-700 text-slate-300",
  Uncommon: "border-emerald-500/50 text-emerald-300",
  Rare: "border-blue-500/50 text-blue-300",
  Epic: "border-purple-500/50 text-purple-300",
  Showcase: "border-gold/60 text-gold",
};

function CardTile({
  card,
  currency,
  selected,
  onSelect,
  children,
  dim,
}: {
  card: SbViewCard;
  currency: string;
  selected?: boolean;
  onSelect?: () => void;
  children?: React.ReactNode;
  dim?: boolean;
}) {
  const revealed = card.priceCents != null;
  const Wrapper: React.ElementType = onSelect ? "button" : "div";
  return (
    <div className={`card-surface flex flex-col overflow-hidden transition-all ${selected ? "ring-2 ring-brand-500" : ""} ${dim ? "opacity-60" : ""}`}>
      <Wrapper
        {...(onSelect ? { onClick: onSelect, "aria-pressed": selected, type: "button" } : {})}
        className={`block text-left ${onSelect ? "hover:bg-ink-850" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.img} alt={card.name} width={300} height={420} className="aspect-[5/7] w-full object-cover" loading="lazy" decoding="async" />
        <div className="p-2.5">
          <div className="truncate text-sm font-bold text-white" title={card.name}>{card.name}</div>
          <div className="text-[11px] text-slate-500">{card.setCode} · {card.collectorNumber}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="chip border px-1.5 py-0 text-[10px]" style={domainStyle(card.domain)}>{card.domain}</span>
            <span className={`chip border bg-ink-950 px-1.5 py-0 text-[10px] ${RARITY_CLASS[card.rarity] ?? "border-ink-700 text-slate-300"}`}>{card.rarity}</span>
            <span className="chip border border-ink-700 bg-ink-950 px-1.5 py-0 text-[10px] text-slate-300">{card.type}</span>
          </div>
          {(card.might != null || card.energy != null) && (
            <div className="num mt-1 text-[11px] text-slate-400">
              {card.energy != null && <span title="energy cost">⚡{card.energy}</span>}
              {card.energy != null && card.might != null && " · "}
              {card.might != null && <span title="might">⚔️{card.might}</span>}
            </div>
          )}
          <div className="num mt-1.5 font-extrabold leading-tight">
            {revealed ? (
              <>
                <span className="block text-sm text-accent sm:text-base">{formatMoney(card.priceCents!, currency)}</span>
                <span className="block text-xs font-semibold text-brand-300">= {fmt(card.shards!)} ◈</span>
              </>
            ) : (
              <>
                <span className="block text-sm text-slate-600 sm:text-base">$ ?.??</span>
                <span className="block text-xs font-semibold text-slate-600">= ? ◈</span>
              </>
            )}
          </div>
        </div>
      </Wrapper>
      {children}
    </div>
  );
}

// ── Auction round ────────────────────────────────────────────────────────────

function TimerBar({ remainingMs, totalMs, label }: { remainingMs: number; totalMs: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const secs = Math.ceil(remainingMs / 1000);
  const urgent = secs <= 10;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={`num font-bold ${urgent ? "text-rose-400" : "text-white"}`} aria-live="polite">{secs}s</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full transition-[width] duration-200 ${urgent ? "bg-rose-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Auction({
  view,
  remainingMs,
  busy,
  onBid,
  onAppraise,
}: {
  view: SbView;
  remainingMs: number;
  busy: boolean;
  onBid: (card: number, amount: number, surge: boolean) => void;
  onAppraise: (card: number) => void;
}) {
  const you = view.you!;
  const [selected, setSelected] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [surge, setSurge] = useState(false);
  const sealed = !!you.bid;
  const max = you.shards;
  const sealedCount = view.players.filter((p) => p.sealed).length;

  const setPct = (pct: number) => setAmount(Math.min(max, Math.max(0, Math.round((max * pct) / 100))));

  return (
    <div className="grid gap-4">
      <div className="card-surface p-3 sm:p-4">
        <TimerBar remainingMs={remainingMs} totalMs={view.timerSec * 1000} label={`Round ${view.round + 1} of ${view.totalRounds} · ${sealedCount}/${view.players.length} bids sealed`} />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {view.cards.map((c, i) => (
          <CardTile key={c.id} card={c} currency={view.currency} selected={selected === i && !sealed} onSelect={sealed ? undefined : () => setSelected(i)} dim={sealed && you.bid?.card !== i}>
            {!sealed && !you.appraiseUsed && (
              <button
                onClick={() => onAppraise(i)}
                disabled={busy}
                className="m-2 mt-0 rounded-md border border-ink-700 bg-ink-950 px-2 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-ink-600 hover:text-white"
                title="Use your one Appraise to privately see this card's real price"
              >
                🔍 Appraise
              </button>
            )}
            {you.appraised === i && <p className="px-2 pb-2 text-center text-[10px] font-semibold text-brand-300">Appraised — only you can see this price</p>}
          </CardTile>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="card-surface p-4">
          {sealed ? (
            <div className="text-center">
              <p className="text-2xl" aria-hidden>🔒</p>
              <p className="mt-1 text-sm font-bold text-white">
                {you.bid!.amount === 0 ? "You passed this round." : (
                  <>
                    Sealed: <span className="num text-brand-300">{fmt(you.bid!.amount)} ◈</span> on <span className="text-white">{view.cards[you.bid!.card]?.name}</span>
                    {you.bid!.surge && <span className="ml-1 text-amber-300" title="Surge: counts +25% against rivals">⚡ Surge</span>}
                  </>
                )}
              </p>
              <p className="mt-1 animate-pulse text-xs text-slate-500">
                Waiting for {view.players.length - sealedCount} more {view.players.length - sealedCount === 1 ? "bid" : "bids"} — or the clock.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">
                  {selected == null ? "Pick a card to bid on" : <>Bid on <span className="text-brand-300">{view.cards[selected]?.name}</span></>}
                </p>
                <p className="num text-xs text-slate-400">You have <span className="font-bold text-white">{fmt(max)} ◈</span></p>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full accent-[#1ea65c]"
                  aria-label="Bid amount"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={max}
                  value={amount}
                  onChange={(e) => setAmount(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                  className="input num w-24 text-right"
                  aria-label="Bid amount in Shards"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[5, 10, 20, 35, 50].map((p) => (
                  <button key={p} onClick={() => setPct(p)} className="chip min-h-9 border border-ink-700 text-slate-300 hover:border-ink-600 hover:text-white">{p}%</button>
                ))}
                <button onClick={() => setAmount(max)} className="chip min-h-9 border border-amber-500/50 text-amber-300 hover:border-amber-400">All in</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  disabled={busy || selected == null}
                  onClick={() => onBid(selected!, amount, surge)}
                  className="btn-primary min-w-[160px]"
                >
                  {amount === 0 ? "Seal a pass 🔒" : `Seal ${fmt(amount)} ◈ 🔒`}
                </button>
                {!you.surgeUsed ? (
                  <button
                    onClick={() => setSurge((s) => !s)}
                    aria-pressed={surge}
                    className={`btn-ghost text-sm ${surge ? "border-amber-400 text-amber-300" : ""}`}
                    title={`Once per game: your bid counts +${SB.SURGE_PCT}% against rivals, but you only pay what you bid`}
                  >
                    ⚡ Surge {surge ? "ON" : "off"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-600">⚡ Surge used</span>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                A bid of 0 passes. Highest bid wins and pays it; a tie for the top bid shatters the card and each tied bidder loses half their bid.
                {!you.appraiseUsed && " Your one 🔍 Appraise reveals a card's real price to you alone — use it before you seal."}
              </p>
            </>
          )}
        </div>
        <Players view={view} />
      </div>
    </div>
  );
}

// ── Reveal ───────────────────────────────────────────────────────────────────

function Reveal({ view, remainingMs }: { view: SbView; remainingMs: number }) {
  const you = view.you!;
  const result = view.result!;
  const nameOf = (pid: string) => view.players.find((p) => p.pid === pid)?.name ?? "?";
  const isLast = view.round + 1 >= view.totalRounds;
  const mine = result.cards.find((r) => r.winnerPid === you.pid);

  return (
    <div className="grid gap-4">
      <div className="card-surface p-3 sm:p-4">
        <TimerBar remainingMs={remainingMs} totalMs={SB.REVEAL_MS} label={isLast ? "Final appraisal in…" : `Round ${view.round + 2} deals in…`} />
      </div>

      <div className="animate-fade-up rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-center text-sm">
        {mine ? (
          <p className="text-white">🏆 You won <strong>{view.cards[mine.card].name}</strong> for <span className="num">{fmt(mine.bids[0].amount)} ◈</span> — appraised at <span className="num font-bold text-brand-300">{fmt(view.cards[mine.card].shards!)} ◈</span>{" "}
            <span className={view.cards[mine.card].shards! >= mine.bids[0].amount ? "text-brand-300" : "text-rose-300"}>
              ({view.cards[mine.card].shards! >= mine.bids[0].amount ? "+" : ""}{fmt(view.cards[mine.card].shards! - mine.bids[0].amount)})
            </span>
          </p>
        ) : result.cards.some((r) => r.shattered && r.bids.some((b) => b.pid === you.pid && b.effective === r.bids[0].effective)) ? (
          <p className="text-rose-200">💥 Shattered! You tied for the top bid and burned half of it.</p>
        ) : you.bid && you.bid.amount > 0 ? (
          <p className="text-slate-200">Outbid this round — your Shards are safe.</p>
        ) : (
          <p className="text-slate-200">You sat this one out.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {result.cards.map((r) => {
          const c = view.cards[r.card];
          return (
            <CardTile key={c.id} card={c} currency={view.currency}>
              <div className="border-t border-ink-800 px-2.5 py-2 text-xs">
                {r.shattered ? (
                  <p className="font-bold text-rose-300">💥 Shattered — tied at {fmt(r.bids[0].effective)} ◈</p>
                ) : r.winnerPid ? (
                  <p className="font-bold text-brand-300">🏆 {nameOf(r.winnerPid)} · {fmt(r.bids[0].amount)} ◈</p>
                ) : (
                  <p className="text-slate-500">No bids</p>
                )}
                {r.bids.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-slate-400">
                    {r.bids.map((b) => (
                      <li key={b.pid} className="flex justify-between gap-2">
                        <span className={`truncate ${b.pid === you.pid ? "text-white" : ""}`}>{nameOf(b.pid)}</span>
                        <span className="num shrink-0">
                          {fmt(b.amount)}{b.surge && <span className="text-amber-300" title="Surge"> ⚡{fmt(b.effective)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardTile>
          );
        })}
      </div>

      <Players view={view} />
    </div>
  );
}

// ── Final ────────────────────────────────────────────────────────────────────

type BoardRow = { rank: number; name: string; score: number; isYou: boolean };

function Final({
  view,
  share,
  busy,
  onRematch,
  onJoinRematch,
  onExit,
}: {
  view: SbView;
  share: string | null;
  busy: boolean;
  onRematch: () => void;
  onJoinRematch: (code: string) => void;
  onExit: () => void;
}) {
  const you = view.you!;
  const me = view.players.find((p) => p.isYou);
  const { copied, share: copy } = useShare();
  const standings = view.standings ?? [];
  const nameOf = (pid: string) => view.players.find((p) => p.pid === pid)?.name ?? "?";
  const mine = standings.find((s) => s.pid === you.pid);
  const [board, setBoard] = useState<{ rows: BoardRow[]; total: number; signedIn: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/games/leaderboard?game=sealed-bid")
      .then((r) => r.json())
      .then((b) => alive && b?.rows && setBoard(b))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const vault = useMemo(() => you.vault.slice().sort((a, b) => (b.shards ?? 0) - (a.shards ?? 0)), [you.vault]);

  return (
    <div className="grid gap-4">
      <div className="card-surface animate-fade-up p-5 text-center">
        <p className="text-3xl" aria-hidden>{mine?.rank === 1 ? "🏆" : mine?.rank === 2 ? "🥈" : mine?.rank === 3 ? "🥉" : "🪦"}</p>
        <h2 className="mt-1 text-xl font-extrabold text-white">
          {mine?.rank === 1 ? "You own the richest vault!" : `You finished #${mine?.rank} of ${view.players.length}`}
        </h2>
        <p className="num mt-1 text-sm text-slate-400">{fmt(mine?.total ?? 0)} pts · {you.vault.length} cards · {fmt(you.shards)} ◈ unspent</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {share && <button onClick={() => copy(share)} className="btn-primary text-sm">{copied ? "Copied ✓" : "Share result"}</button>}
          {me?.isHost && !view.nextCode && <button disabled={busy} onClick={onRematch} className="btn-ghost text-sm">🔁 Rematch (new room)</button>}
          {view.nextCode && (
            <button disabled={busy} onClick={() => onJoinRematch(view.nextCode!)} className="btn-primary text-sm">
              🔁 {me?.isHost ? "Go to rematch room" : "Join the rematch"} · {view.nextCode}
            </button>
          )}
          <button onClick={onExit} className="btn-ghost text-sm">New game</button>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-ink-800 px-4 py-2.5">
          <h3 className="text-sm font-bold text-white">Final standings</h3>
        </div>
        <ul className="divide-y divide-ink-800">
          {standings.map((s) => (
            <StandingRow key={s.pid} s={s} name={nameOf(s.pid)} isYou={s.pid === you.pid} />
          ))}
        </ul>
        <p className="border-t border-ink-800 px-4 py-2 text-[11px] text-slate-500">
          Score = vault appraisal (1 ◈ per {formatMoney(10, view.currency)} of live price) + ½ unspent Shards + bonuses: {SB.BONUS.DOMAIN_SET} per domain with 3+ cards, {SB.BONUS.RAINBOW} for {SB.RAINBOW_DOMAINS}+ domains, {SB.BONUS.WARBAND} for {SB.WARBAND_MIGHT}+ total Might.
        </p>
      </div>

      {vault.length > 0 && (
        <div className="card-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-2.5">
            <h3 className="text-sm font-bold text-white">🗝️ Your vault</h3>
            <span className="text-[11px] text-slate-500">live {view.currency} prices · paid vs appraised</span>
          </div>
          <ul className="divide-y divide-ink-800">
            {vault.map((c) => {
              const profit = (c.shards ?? 0) - c.paid;
              return (
                <li key={`${c.round}-${c.id}`} className="flex items-center gap-3 px-4 py-2">
                  <Link href={`/card/${c.slug ?? c.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.img} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{c.name}</span>
                      <span className="block text-[11px] text-slate-500">{c.domain} · {c.rarity} · paid {fmt(c.paid)} ◈</span>
                    </span>
                  </Link>
                  <span className="num shrink-0 text-right text-sm">
                    <span className="block font-bold text-accent">{formatMoney(c.priceCents!, view.currency)}</span>
                    <span className={`block text-[11px] ${profit >= 0 ? "text-brand-300" : "text-rose-300"}`}>{profit >= 0 ? "+" : ""}{fmt(profit)} ◈</span>
                  </span>
                  <Link href={`/card/${c.slug ?? c.id}`} className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs">Compare →</Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {board && board.rows.length > 0 && (
        <div className="card-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5">
            <h3 className="text-sm font-bold text-white">🏆 Global leaderboard</h3>
            <span className="text-[11px] text-slate-500">{board.total} {board.total === 1 ? "player" : "players"} · best single game</span>
          </div>
          <ul className="divide-y divide-ink-800">
            {board.rows.map((r) => (
              <li key={r.rank} className={`flex items-center gap-3 px-4 py-2 text-sm ${r.isYou ? "bg-brand-500/10" : ""}`}>
                <span className={`w-6 text-center font-bold ${r.rank === 1 ? "text-gold" : r.rank <= 3 ? "text-slate-300" : "text-slate-500"}`}>
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                </span>
                <span className={`flex-1 truncate ${r.isYou ? "font-bold text-white" : "text-slate-300"}`}>{r.name}{r.isYou ? " (you)" : ""}</span>
                <span className="num font-bold text-white">{fmt(r.score)} <span className="text-[11px] font-normal text-slate-500">pts</span></span>
              </li>
            ))}
          </ul>
          {!board.signedIn && (
            <p className="border-t border-ink-800 px-4 py-2 text-[11px] text-slate-500">
              <Link href="/login?next=/games/sealed-bid" className="font-semibold text-brand-400 hover:underline">Sign in</Link> before your next game and your total is saved here automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StandingRow({ s, name, isYou }: { s: SbStanding; name: string; isYou: boolean }) {
  return (
    <li className={`px-4 py-2.5 ${isYou ? "bg-brand-500/10" : ""}`}>
      <div className="flex items-center gap-3 text-sm">
        <span className={`w-6 text-center font-bold ${s.rank === 1 ? "text-gold" : s.rank <= 3 ? "text-slate-300" : "text-slate-500"}`}>
          {s.rank === 1 ? "🥇" : s.rank === 2 ? "🥈" : s.rank === 3 ? "🥉" : s.rank}
        </span>
        <span className={`flex-1 truncate ${isYou ? "font-bold text-white" : "text-slate-200"}`}>{name}{isYou ? " (you)" : ""}</span>
        <span className="num font-extrabold text-white">{fmt(s.total)} <span className="text-[11px] font-normal text-slate-500">pts</span></span>
      </div>
      <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-9 text-[11px] text-slate-500">
        <span>vault {fmt(s.vaultShards)}</span>
        <span>½ of {fmt(s.leftoverShards)} unspent = {fmt(s.leftoverCredit)}</span>
        {s.bonuses.map((b) => (
          <span key={b.label} className="text-brand-300">+{b.points} {b.label}</span>
        ))}
      </div>
    </li>
  );
}
