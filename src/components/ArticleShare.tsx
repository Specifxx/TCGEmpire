"use client";

import { useState } from "react";

// Social share row for articles. Plain anchors to each network's share
// endpoint — no third-party share SDKs, which are the usual source of both the
// tracking and the ~100 KB of JS that would undo the performance work.
//
// The copy-link button is the one interactive part; it degrades to nothing on a
// browser without the async clipboard API rather than showing a broken control.
export function ArticleShare({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  const links = [
    { label: "Share on X", short: "X", href: `https://x.com/intent/tweet?url=${u}&text=${t}` },
    { label: "Share on Reddit", short: "Reddit", href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { label: "Share on Facebook", short: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Share:</span>
      {links.map((l) => (
        <a
          key={l.short}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={l.label}
          className="btn-ghost text-xs"
        >
          {l.short}
        </a>
      ))}
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* clipboard unavailable — ignore */
          }
        }}
        aria-label="Copy link to this article"
        className="btn-ghost text-xs"
      >
        {copied ? "✓ Copied" : "🔗 Copy link"}
      </button>
    </div>
  );
}
