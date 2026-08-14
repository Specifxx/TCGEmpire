"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { SITE_URL } from "@/lib/site";

// Reusable "share this" row. Same principle as ArticleShare (which predates it
// and stays as-is for article bylines): plain anchors to each network's own
// share endpoint — NO third-party share SDKs, which are where both the tracking
// and the ~100 KB of JS would come from.
//
// What this adds over ArticleShare: the Web Share API on devices that have it
// (one tap into the real OS share sheet, including apps we could never
// enumerate — Discord, WhatsApp, Messages, AirDrop), WhatsApp as an explicit
// fallback target, and analytics on which channel people actually use.
//
// The native path is ADDITIVE, never a replacement: navigator.share exists on
// most phones and almost no desktops, so the explicit buttons always render.
// A share sheet the user dismisses throws AbortError — that is a normal
// outcome, not an error, and must not surface as a broken-looking UI.

export interface ShareRowProps {
  /** Absolute URL to share. Defaults to the site root. */
  url?: string;
  /** Headline used by networks that accept text (X, Reddit, WhatsApp). */
  title?: string;
  /** Where this row is mounted — becomes the analytics `source`. */
  source: string;
  className?: string;
  /** Compact variant for tight spaces (the feedback widget). */
  size?: "sm" | "md";
}

const DEFAULT_TITLE = "RiftCompare — compare Riftbound card prices across every store";

export function ShareRow({ url, title, source, className, size = "md" }: ShareRowProps) {
  const shareUrl = url ?? SITE_URL;
  const shareTitle = title ?? DEFAULT_TITLE;
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // Feature-detected AFTER mount, never during render: navigator.share does not
  // exist on the server, and branching on it during render would desync the
  // server and client HTML (a hydration error on every page this appears on).
  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(shareTitle);

  const links = [
    { key: "x", label: "Share on X", short: "X", href: `https://x.com/intent/tweet?url=${u}&text=${t}` },
    { key: "reddit", label: "Share on Reddit", short: "Reddit", href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { key: "facebook", label: "Share on Facebook", short: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "whatsapp", label: "Share on WhatsApp", short: "WhatsApp", href: `https://api.whatsapp.com/send?text=${t}%20${u}` },
  ];

  const btn = size === "sm" ? "btn-ghost px-2 py-1 text-[11px]" : "btn-ghost text-xs";

  async function nativeShare() {
    try {
      await navigator.share({ title: shareTitle, url: shareUrl });
      track("share_click", { channel: "native", source });
    } catch {
      // AbortError when the user dismisses the sheet — an ordinary choice, not
      // a failure. Nothing to show, nothing to log.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      track("share_click", { channel: "copy", source });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable (insecure context / old browser) — ignore */
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      {canNativeShare && (
        <button type="button" onClick={nativeShare} className={`${btn} border-brand-500/40 text-brand-300`}>
          ↗ Share
        </button>
      )}
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={l.label}
          onClick={() => track("share_click", { channel: l.key, source })}
          className={btn}
        >
          {l.short}
        </a>
      ))}
      <button type="button" onClick={copy} aria-label="Copy link" className={btn}>
        {copied ? "✓ Copied" : "🔗 Copy link"}
      </button>
    </div>
  );
}
