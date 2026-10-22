"use client";

import { useState } from "react";
import type { Creator, CreatorLink, CreatorPlatform } from "@/lib/content/creators";
import { EDIT_PLATFORMS, MAX_BLURB, MAX_LINKS } from "@/lib/content/creator-edit";

// A creator edits their own card (/creators/edit/<token>). The server re-validates.
export function CreatorProfileForm({ token, creator }: { token: string; creator: Creator }) {
  const [blurb, setBlurb] = useState(creator.blurb);
  const [links, setLinks] = useState<CreatorLink[]>(creator.links.length ? creator.links : [{ platform: "YouTube", url: "" }]);
  const [tipUrl, setTipUrl] = useState(creator.tipUrl ?? "");
  const [tags, setTags] = useState((creator.tags ?? []).join(", "));
  const [region, setRegion] = useState(creator.region ?? "");
  const [state, setState] = useState<{ busy?: boolean; error?: string; saved?: boolean }>({});

  const setLink = (i: number, patch: Partial<CreatorLink>) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const input = "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    const res = await fetch("/api/creators/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, blurb, links, tipUrl, tags, region }),
    }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { error?: string } | null;
    setState(res?.ok ? { saved: true } : { error: d?.error ?? "Couldn't save. Try again." });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">What you make (one line)</span>
        <input className={input} value={blurb} maxLength={MAX_BLURB} onChange={(e) => setBlurb(e.target.value)} />
        <span className="text-xs text-slate-500">{blurb.length}/{MAX_BLURB}</span>
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-slate-200">Your links (first one is your main link)</legend>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select className="rounded-lg border border-ink-700 bg-ink-900 px-2 text-sm text-white" value={l.platform} onChange={(e) => setLink(i, { platform: e.target.value as CreatorPlatform, handle: undefined })}>
              {EDIT_PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <input className={input} placeholder="https://…" value={l.url} onChange={(e) => setLink(i, { url: e.target.value, handle: undefined })} />
            <button type="button" aria-label="Remove link" className="px-2 text-slate-400" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" className="text-sm font-semibold text-brand-400" onClick={() => setLinks((ls) => [...ls, { platform: "TikTok", url: "" }])}>+ Add a link</button>
        )}
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Tip page (Ko-fi, Patreon…), optional</span>
        <input className={input} placeholder="https://ko-fi.com/…" value={tipUrl} onChange={(e) => setTipUrl(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Tags, up to 3, comma-separated</span>
        <input className={input} placeholder="Pack openings, Deck techs" value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Where you&apos;re based, optional</span>
        <input className={input} placeholder="AU" value={region} maxLength={20} onChange={(e) => setRegion(e.target.value)} />
      </label>
      <button disabled={state.busy} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        {state.busy ? "Saving…" : "Save my card"}
      </button>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.saved && <p className="text-sm text-up">Saved. Your card on /creators updates within a minute or two.</p>}
    </form>
  );
}
