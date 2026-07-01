"use client";

import { useState } from "react";

// A single ready-to-copy widget example: a live preview of the embed plus its
// copy-paste <iframe> snippet. Used on the /widgets distribution page.
export function EmbedSnippet({ src, title, width = 340, height = 150 }: { src: string; title: string; width?: number; height?: number }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<iframe src="${src}" width="${width}" height="${height}" style="border:0;overflow:hidden" loading="lazy" title="RiftCompare live price — ${title}"></iframe>`;

  const copy = () => {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="card-surface p-4">
      <div className="mb-1 text-sm font-semibold text-white">{title}</div>
      <iframe
        src={src}
        width={width}
        height={height}
        style={{ border: 0, overflow: "hidden", maxWidth: "100%" }}
        loading="lazy"
        title={`RiftCompare live price — ${title}`}
      />
      <div className="mt-3 flex items-start gap-2">
        <code className="block flex-1 overflow-x-auto rounded-lg bg-ink-950 p-3 text-[11px] leading-relaxed text-slate-300">
          {snippet}
        </code>
        <button type="button" onClick={copy} className="btn-primary shrink-0 text-xs">
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
