"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";
import { useCountry } from "./CountryProvider";
import { currencyOf, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardImageSrc } from "@/lib/card-image-url";
import { trackEvent } from "@/lib/analytics";
import { markSignupSource } from "@/lib/signup-source";
import { trackAuthStart, trackSignupCta } from "@/lib/growth-events";
import { pullBragFields, pullKey, pullsCsv, shareCode, summarisePulls, type PullLine } from "@/lib/pull-tracker";
import { bragModel, prepareBrag, shareBrag, whenIdle } from "@/lib/brag-card";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { shareUrl } from "@/lib/share-link";
import type { PullCard } from "@/lib/pull-tracker-server";
import { Toast } from "./ui/Toast";
import { MAX_PACKS_PER_LOG, pullTier } from "@/lib/pull-rates";
import { shrinkPhoto } from "@/lib/scan/shrink";

// The pull tracker (lib/pull-tracker.ts has the why). Everything here is the
// visitor's own: the pulls live in this browser until they save them to their
// binder (the collection import, one request) or share a link that carries them.
export const PULL_TRACKER_SOURCE = "pull_tracker";
const RARITIES = ["Showcase", "Epic", "Rare", "Uncommon", "Common"] as const;
const storeKey = (slug: string) => `rc_pulls_${slug}`;
const saveFlagKey = (slug: string) => `rc_pulls_save_${slug}`;

export function PullTracker({
  set,
  cards,
  boxPriceCents,
}: {
  set: { slug: string; code: string; name: string };
  cards: PullCard[];
  /** The cheapest open booster box per market, when known (pre-fills "what you paid"). */
  boxPriceCents?: Partial<Record<Country, number>>;
}) {
  const { country } = useCountry();
  const { user, loaded, providers } = useMe();
  const pathname = usePathname();
  const cur = currencyOf(country);
  const [lines, setLines] = useState<PullLine[]>([]);
  const [paid, setPaid] = useState<string>("");
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<string>("hits");
  const [saveState, setSaveState] = useState<{ kind: "idle" | "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string }>({ kind: "idle" });
  const [shared, setShared] = useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  useEffect(() => {
    try {
      setCanShareFiles(!!navigator.canShare?.({ files: [new File([new Blob(["x"])], "t.jpg", { type: "image/jpeg" })] }));
    } catch {
      /* no file sharing: the link alone */
    }
  }, []);
  const restored = useRef(false);
  // Community pull rates (lib/pull-rates.ts): the packs these pulls came from, and the one POST.
  const [packs, setPacks] = useState<string>("");
  const [contrib, setContrib] = useState<{ kind: "idle" | "busy" } | { kind: "done"; id: string } | { kind: "error"; text: string }>({ kind: "idle" });
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const usedScan = useRef(false);
  const scanInput = useRef<HTMLInputElement>(null);
  // A short confirmation after each tap, for phones, where the total sits below the grid.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const byNum = useMemo(() => new Map(cards.map((c) => [pullKey(c.collectorNumber), c])), [cards]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const priceOf = (c: PullCard) => c.p[country] ?? null;

  // Restore this set's pulls (and what was paid) from the last visit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey(set.slug));
      if (raw) {
        const s = JSON.parse(raw) as { lines?: PullLine[]; paid?: string };
        if (Array.isArray(s.lines)) setLines(s.lines.filter((l) => byNum.has(l.num)).slice(0, 60));
        if (typeof s.paid === "string") setPaid(s.paid);
      }
    } catch {
      /* storage blocked: start empty */
    }
    restored.current = true;
  }, [set.slug, byNum]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(storeKey(set.slug), JSON.stringify({ lines, paid }));
    } catch {
      /* as above */
    }
  }, [lines, paid, set.slug]);
  // Pre-fill what a box costs here, once, if the visitor has not typed anything.
  useEffect(() => {
    const box = boxPriceCents?.[country];
    if (box && restored.current && !paid) setPaid((box / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, boxPriceCents]);

  const add = (num: string) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.num === num);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [{ num, qty: 1 }, ...ls].slice(0, 60);
    });
    setShared(null);
    if (contrib.kind === "done") setContrib({ kind: "idle" });
    trackEvent("pull_add", { set: set.code });
    const c = byNum.get(num);
    if (c) {
      setToast(`Added ${c.name}`);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 1800);
    }
  };
  // "Scan a hit": one card through the card scanner (/api/scan/identify, the member's daily scans), added
  // when it is a card of this set. The photo is shrunk here and never stored.
  const scanHit = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const photo = await shrinkPhoto(file);
      const res = await fetch("/api/scan/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: photo.split(",")[1] }) });
      const d = (await res.json().catch(() => ({}))) as { error?: string; card?: { id: string } | null; remaining?: number | null };
      if (!res.ok) {
        setScanMsg(d.error ?? "Couldn't read that photo. Try again, or tap the card below.");
        return;
      }
      const c = d.card ? byId.get(d.card.id) : undefined;
      if (!c) {
        setScanMsg(d.card ? `That card isn't from ${set.name}.` : "No card found in that photo. Try a sharper one, or tap it below.");
        return;
      }
      usedScan.current = true;
      add(pullKey(c.collectorNumber));
      setScanMsg(`Scanned: ${c.name} ${c.collectorNumber}${typeof d.remaining === "number" ? ` · ${d.remaining} scan${d.remaining === 1 ? "" : "s"} left today` : ""}`);
      trackEvent("pull_scan", { set: set.code });
    } catch {
      setScanMsg("Couldn't read that photo. Try again, or tap the card below.");
    } finally {
      setScanning(false);
      if (scanInput.current) scanInput.current.value = "";
    }
  };

  const bump = (num: string, d: number) => {
    setLines((ls) => ls.map((l) => (l.num === num ? { ...l, qty: Math.max(0, Math.min(99, l.qty + d)) } : l)).filter((l) => l.qty > 0));
    setShared(null);
  };

  const paidCents = (() => {
    const v = Number(paid);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
  })();
  const priced = lines.map((l) => {
    const c = byNum.get(l.num);
    return { num: l.num, qty: l.qty, eachCents: c ? priceOf(c) : null };
  });
  const sum = summarisePulls(priced, paidCents);

  // What the community tally would count from these pulls: Epic and up only.
  const hitLines = lines
    .map((l) => ({ l, c: byNum.get(l.num) }))
    .filter((x): x is { l: PullLine; c: PullCard } => !!x.c && pullTier({ setCode: set.code, rarity: x.c.rarity, collectorNumber: x.c.collectorNumber }) != null);
  const hitCount = hitLines.reduce((n, x) => n + x.l.qty, 0);
  const packsN = (() => {
    const v = Number(packs);
    return Number.isInteger(v) && v >= 1 && v <= MAX_PACKS_PER_LOG ? v : null;
  })();
  const contribute = async () => {
    if (!packsN || contrib.kind === "busy") return;
    setContrib({ kind: "busy" });
    try {
      const r = await fetch("/api/pulls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ set: set.slug, packs: packsN, hits: hitLines.map((x) => ({ cardId: x.c.id, qty: x.l.qty })), source: usedScan.current ? "scan" : "pick" }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
      if (!r.ok || !d.id) throw new Error(d.error ?? "Couldn't add them just now. Try again.");
      setContrib({ kind: "done", id: d.id });
      trackEvent("pull_log", { set: set.code, packs: packsN, hits: hitCount });
    } catch (e) {
      setContrib({ kind: "error", text: e instanceof Error ? e.message : "Couldn't add them just now. Try again." });
    }
  };
  const undoContribute = async () => {
    if (contrib.kind !== "done") return;
    const id = contrib.id;
    setContrib({ kind: "busy" });
    const r = await fetch(`/api/pulls?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    setContrib(r?.ok ? { kind: "idle" } : { kind: "done", id });
  };

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    let pool = cards;
    if (rarity === "hits") pool = pool.filter((c) => c.rarity === "Showcase" || c.rarity === "Epic" || c.rarity === "Rare");
    else if (rarity !== "all") pool = pool.filter((c) => c.rarity === rarity);
    if (term) pool = cards.filter((c) => c.name.toLowerCase().includes(term) || c.collectorNumber.toLowerCase().startsWith(term));
    return [...pool].sort((a, b) => (b.p[country] ?? -1) - (a.p[country] ?? -1)).slice(0, 36);
  }, [cards, q, rarity, country]);

  // Save to the binder: the collection import's printing-aware CSV path.
  const save = async () => {
    if (!lines.length) return;
    setSaveState({ kind: "busy" });
    const csv = pullsCsv(
      set.code,
      lines.map((l) => ({ num: l.num, qty: l.qty, name: byNum.get(l.num)?.name ?? "" })),
    );
    try {
      const r = await fetch("/api/collection/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: csv }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) throw new Error(d?.error ?? "save failed");
      const skipped = d.limitSkipped ? ` ${d.limitSkipped} didn't fit in a free binder (50 cards).` : "";
      setSaveState({ kind: "done", text: `Added ${d.copies ?? d.added} card${(d.copies ?? d.added) === 1 ? "" : "s"} to your binder.${skipped}` });
      trackEvent("pull_save", { set: set.code, lines: lines.length });
    } catch {
      setSaveState({ kind: "error", text: "Couldn't save just now. Your pulls are still here; try again." });
    }
  };
  // Back from sign-in with a save pending: finish it.
  useEffect(() => {
    if (!loaded || !user || !lines.length) return;
    try {
      if (localStorage.getItem(saveFlagKey(set.slug))) {
        localStorage.removeItem(saveFlagKey(set.slug));
        void save();
      }
    } catch {
      /* nothing pending */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user, lines.length]);

  const startOAuth = (provider: "google" | "discord") => {
    try {
      localStorage.setItem(saveFlagKey(set.slug), "1");
    } catch {
      /* the save is one more click after sign-in */
    }
    markSignupSource(PULL_TRACKER_SOURCE);
    trackSignupCta(PULL_TRACKER_SOURCE);
    trackAuthStart(provider, PULL_TRACKER_SOURCE);
  };
  const back = encodeURIComponent(pathname || `/tools/pull-tracker/${set.slug}`);

  // The "I pulled" brag card (lib/brag-card.ts, 2026-11-26, community plan move 4): on a phone that can share a picture,
  // the best card's art, its price and the log against what was paid, as a 1080x1350 image with the share link. Drawn
  // ahead (a second after the last change, in idle time) so the tap opens the share sheet at once. Desktops and logs with
  // nothing priced share the link alone, as before; that page has its own share image.
  const bestCard = sum.best ? byNum.get(sum.best.num) ?? null : null;
  const bragFields = pullBragFields(set.name, bestCard && sum.best?.eachCents ? { name: bestCard.name, eachCents: sum.best.eachCents } : null, sum, paidCents, (c) => formatMoney(c, cur));
  const brag =
    bragFields && canShareFiles
      ? bragModel({ site: SITE_NAME, host: new URL(SITE_URL).host, accent: "#34d17e", ...bragFields, image: bestCard ? cardImageSrc(bestCard) : null, imageShape: "card", date: new Date() })
      : null;
  const bragKey = brag ? JSON.stringify(brag) : "";
  useEffect(() => {
    if (!brag) return;
    let cancel = () => {};
    const t = setTimeout(() => (cancel = whenIdle(() => void prepareBrag(brag))), 1000);
    return () => {
      clearTimeout(t);
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bragKey]);

  const share = async () => {
    const url = shareUrl(window.location.origin, `/tools/pull-tracker/${set.slug}/s/${shareCode(lines, paidCents, country)}`, "pulls");
    const text = `My ${set.name} pulls: ${formatMoney(sum.totalCents, cur)}${paidCents ? ` from ${formatMoney(paidCents, cur)}` : ""}`;
    trackEvent("pull_share", { set: set.code, lines: lines.length });
    trackEvent("share", { medium: "pulls" });
    if (brag) {
      const how = await shareBrag(await prepareBrag(brag), text, url, `my-${set.slug}-pull`);
      if (how === "image" || how === "text") {
        trackEvent("brag_share", { kind: "pull", how });
        setShared(url);
        return;
      }
      if (how === "cancelled") return;
      if (how === "saved") {
        trackEvent("brag_share", { kind: "pull", how });
        setShared(url);
        return;
      }
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        setShared(url);
        return;
      }
    } catch {
      /* cancelled or unsupported: fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* the link is shown below to copy by hand */
    }
    setShared(url);
  };

  const totalRef = useRef<HTMLElement | null>(null);
  const diffTone = sum.diffCents == null ? "text-slate-300" : sum.diffCents >= 0 ? "text-up" : "text-red-400";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* ── Pick what you pulled ── */}
      <section aria-labelledby="pt-pick" className="card-surface p-4 sm:p-5">
        <h2 id="pt-pick" className="text-lg font-extrabold text-white">
          Tap what you pulled
        </h2>
        <p className="mt-1 text-sm text-slate-400">Your hits are what move the total, so log the rares and up; commons are a few cents each.</p>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${set.name} by name or number`}
          className="input mt-3 w-full"
          aria-label={`Search ${set.name} cards`}
        />
        {loaded && user && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={scanInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scanHit(e.target.files?.[0])} />
            <button type="button" disabled={scanning} onClick={() => scanInput.current?.click()} className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-60">
              {scanning ? "Reading the card…" : "📷 Scan a hit"}
            </button>
            {scanMsg && <span className="text-xs text-slate-400" role="status">{scanMsg}</span>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Rarity">
          {[["hits", "Rare and up"], ...RARITIES.map((r) => [r, r]), ["all", "All"]].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setRarity(v)}
              aria-pressed={rarity === v}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${rarity === v ? "bg-brand-500/20 text-brand-200 ring-brand-500/50" : "bg-ink-800 text-slate-300 ring-white/10 hover:bg-ink-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {results.map((c) => {
            const k = pullKey(c.collectorNumber);
            const n = lines.find((l) => l.num === k)?.qty ?? 0;
            const src = cardImageSrc(c);
            const price = priceOf(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => add(k)}
                  className={`group relative block w-full rounded-lg p-1 text-left ring-1 transition active:scale-[0.97] ${n ? "bg-gold/10 ring-gold/50" : "bg-ink-900 ring-white/10 hover:ring-white/30"}`}
                  aria-label={`Add ${c.name} ${c.collectorNumber}${n ? `, ${n} logged` : ""}`}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={c.name} aria-hidden="true" loading="lazy" className="aspect-[5/7] w-full rounded-md object-cover" />
                  ) : (
                    <span className="grid aspect-[5/7] w-full place-items-center rounded-md bg-ink-800 text-[10px] text-slate-500">{c.collectorNumber}</span>
                  )}
                  {n > 0 && <span className="absolute right-1.5 top-1.5 rounded-full bg-gold px-1.5 text-[11px] font-black text-ink-950">×{n}</span>}
                  <span className="mt-1 block truncate text-[11px] font-semibold text-slate-200">{c.name}</span>
                  <span className="block text-[11px] text-slate-400">{price != null ? formatMoney(price, cur) : "No price yet"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!results.length && <p className="mt-4 text-sm text-slate-400">No {set.name} card matches that.</p>}
      </section>

      {/* ── What it's worth ── */}
      <aside ref={totalRef} aria-labelledby="pt-total" className="scroll-mt-header lg:sticky lg:top-24 lg:self-start">
        <div className="card-surface overflow-hidden rounded-2xl border border-gold/30">
          <div className="bg-[radial-gradient(ellipse_at_top,rgba(232,183,72,0.16),transparent_65%)] p-4 sm:p-5">
            <h2 id="pt-total" className="text-xs font-bold uppercase tracking-[0.2em] text-gold">
              Your {set.name} pulls
            </h2>
            <p className="mt-1 text-3xl font-black text-white num">{formatMoney(sum.totalCents, cur)}</p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <span className="shrink-0">You paid</span>
              <input
                inputMode="decimal"
                value={paid}
                onChange={(e) => setPaid(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))}
                placeholder="0.00"
                className="input w-28 py-1 text-right num"
                aria-label={`What you paid, in ${cur}`}
              />
              <span className="text-slate-500">{cur}</span>
            </label>
            {sum.diffCents != null && (
              <p className={`mt-2 text-sm font-bold ${diffTone}`}>
                {sum.diffCents >= 0 ? "▲ " : "▼ "}
                {formatMoney(Math.abs(sum.diffCents), cur)} {sum.diffCents >= 0 ? "more than you paid" : "less than you paid"}
                {sum.ratio != null && <span className="font-semibold text-slate-400"> · {Math.round(sum.ratio * 100)}% of the price</span>}
              </p>
            )}
            {sum.unpricedLines > 0 && <p className="mt-1 text-xs text-slate-500">{sum.unpricedLines} card{sum.unpricedLines === 1 ? " has" : "s have"} no price yet and count as nothing.</p>}
          </div>

          <ul className="max-h-[320px] divide-y divide-white/5 overflow-y-auto">
            {lines.map((l) => {
              const c = byNum.get(l.num);
              if (!c) return null;
              const each = priceOf(c);
              return (
                <li key={l.num} className="flex items-center gap-2 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={c.slug ? `/card/${c.slug}` : "#"} className="block truncate text-sm font-semibold text-slate-100 hover:underline">
                      {c.name}
                    </Link>
                    <span className="text-[11px] text-slate-500">
                      {c.collectorNumber} · {each != null ? formatMoney(each * l.qty, cur) : "no price yet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => bump(l.num, -1)} className="h-7 w-7 rounded-md bg-ink-800 text-slate-200 hover:bg-ink-700" aria-label={`One fewer ${c.name}`}>
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold text-white num">{l.qty}</span>
                    <button type="button" onClick={() => bump(l.num, 1)} className="h-7 w-7 rounded-md bg-ink-800 text-slate-200 hover:bg-ink-700" aria-label={`One more ${c.name}`}>
                      +
                    </button>
                  </div>
                </li>
              );
            })}
            {!lines.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing logged yet. Tap a card to add it.</li>}
          </ul>

          {lines.length > 0 && (
            <div className="space-y-2 border-t border-white/5 p-4">
              {/* The moment of pride (growth plan 2026-11-03): a box that beat its
                  price is the result people want to show, so say so right here. */}
              {sum.diffCents != null && sum.diffCents > 0 && (
                <p className="rounded-lg bg-gold/10 px-3 py-2 text-center text-sm font-bold text-gold ring-1 ring-gold/40">
                  You beat the box by {formatMoney(sum.diffCents, cur)}. Show your crew!
                </p>
              )}
              <button type="button" onClick={share} className="btn-primary w-full text-sm">
                {sum.diffCents != null && sum.diffCents > 0 ? "Share my win" : "Share my pulls"}
              </button>
              {shared && (
                <p className="break-all text-[11px] text-slate-400">
                  Link copied: <a href={shared} className="text-brand-300 underline-offset-2 hover:underline">{shared.replace(/^https?:\/\//, "")}</a>
                </p>
              )}
              {!loaded ? null : user ? (
                <button type="button" onClick={save} disabled={saveState.kind === "busy"} className="btn-ghost w-full text-sm">
                  {saveState.kind === "busy" ? "Saving…" : "Save to my binder"}
                </button>
              ) : (
                <div>
                  <p className="text-xs text-slate-400">Save them to a free binder that tracks their value:</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {providers.includes("google") && (
                      <a href={`/api/auth/oauth/google?next=${back}`} rel="nofollow" onClick={() => startOAuth("google")} className="btn-ghost text-sm">
                        Save with Google
                      </a>
                    )}
                    {providers.includes("discord") && (
                      <a href={`/api/auth/oauth/discord?next=${back}`} rel="nofollow" onClick={() => startOAuth("discord")} className="btn-ghost text-sm">
                        Save with Discord
                      </a>
                    )}
                    {!providers.length && (
                      <Link href={`/login?src=${PULL_TRACKER_SOURCE}&next=${back}`} rel="nofollow" onClick={() => startOAuth("google")} className="btn-ghost text-sm">
                        Create a free account
                      </Link>
                    )}
                  </div>
                </div>
              )}
              {saveState.kind === "done" && (
                <p className="text-xs text-gold">
                  {saveState.text}{" "}
                  <Link href="/portfolio" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
                    Open my binder →
                  </Link>
                </p>
              )}
              {saveState.kind === "error" && <p className="text-xs text-red-400">{saveState.text}</p>}
              <button
                type="button"
                onClick={() => {
                  setLines([]);
                  setShared(null);
                  setSaveState({ kind: "idle" });
                  setPacks("");
                  setContrib({ kind: "idle" });
                  usedScan.current = false;
                }}
                className="w-full text-xs font-semibold text-slate-500 hover:text-slate-300"
              >
                Start a new box
              </button>
            </div>
          )}
        </div>
        {/* ── Community pull rates: the packs these came from (lib/pull-rates.ts). No pop-up: it sits here. ── */}
        <section aria-labelledby="pt-community" className="card-surface mt-3 rounded-2xl p-4">
          <h2 id="pt-community" className="text-sm font-extrabold text-white">
            Add to the {set.name} pull rates
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Say how many packs these came from, with every Epic and Showcase they gave you tapped above (none is fine too). Members&apos; packs make the{" "}
            <Link href={`/pull-rates/${set.slug}`} className="text-brand-300 underline-offset-2 hover:underline">
              community pull rates
            </Link>
            ; only the totals are ever shown.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span>Packs opened</span>
              <input
                inputMode="numeric"
                value={packs}
                onChange={(e) => {
                  setPacks(e.target.value.replace(/[^0-9]/g, "").slice(0, 2));
                  if (contrib.kind === "done") setContrib({ kind: "idle" });
                }}
                placeholder="24"
                className="input w-16 py-1 text-right num"
                aria-label="Packs opened"
              />
            </label>
            {[["1", "1 pack"], ["24", "A box (24)"]].map(([v, label]) => (
              <button key={v} type="button" onClick={() => setPacks(v)} aria-pressed={packs === v} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${packs === v ? "bg-brand-500/20 text-brand-200 ring-brand-500/50" : "bg-ink-800 text-slate-300 ring-white/10"}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Counts {hitCount} Epic or Showcase card{hitCount === 1 ? "" : "s"}
            {lines.length > hitLines.length ? "; Rares and below are not part of the rates" : ""}.
          </p>
          {!loaded ? null : !user ? (
            <p className="mt-2 text-xs text-slate-400">Adding packs needs a free account, one per opener, so the counts stay honest.</p>
          ) : contrib.kind === "done" ? (
            <p className="mt-2 text-xs text-gold" role="status">
              Added, thank you. Your packs count from the next update, within about 12 hours.{" "}
              <button type="button" onClick={undoContribute} className="font-semibold text-slate-300 underline">
                Undo
              </button>
            </p>
          ) : (
            <button type="button" onClick={contribute} disabled={!packsN || contrib.kind === "busy"} className="btn-ghost mt-2 w-full text-sm disabled:opacity-50">
              {contrib.kind === "busy" ? "Adding…" : packsN ? `Add my ${packsN} pack${packsN === 1 ? "" : "s"}` : "Enter the packs you opened"}
            </button>
          )}
          {contrib.kind === "error" && <p className="mt-1 text-xs text-red-400">{contrib.text}</p>}
        </section>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-slate-500">
          Each card is valued at the cheapest in-stock store price in {country === "EU" ? "the eurozone" : "your country"}, updated twice a day. It is what the
          card costs to buy, not what a store would pay you for it.
        </p>
      </aside>
      <Toast
        open={!!toast}
        className="lg:hidden"
        message={
          <>
            {toast} · <strong className="num">{formatMoney(sum.totalCents, cur)}</strong> total
          </>
        }
        action={
          <button type="button" onClick={() => totalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="shrink-0 text-xs font-bold text-brand-300">
            View
          </button>
        }
      />
    </div>
  );
}
