"use client";

import { useState } from "react";

export function CreatorEditLinkButton({ slug, adminKey }: { slug: string; adminKey: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function make() {
    if (url === null && !confirm("Make a new edit link? Any older link for this creator stops working.")) return;
    const q = adminKey ? `?key=${encodeURIComponent(adminKey)}` : "";
    const res = await fetch(`/api/admin/creators${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (d?.url) setUrl(d.url);
    else setErr(d?.error ?? "Failed");
  }
  return (
    <div className="text-sm">
      <button type="button" onClick={make} className="rounded bg-ink-700 px-2 py-1 font-semibold text-white">Make edit link</button>
      {url && <input readOnly value={url} onFocus={(e) => e.target.select()} className="ml-2 w-80 rounded border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-slate-200" />}
      {err && <span className="ml-2 text-red-400">{err}</span>}
    </div>
  );
}
