"use client";

import Link from "next/link";
import { useState } from "react";
import { KEYWORDS, keywordSlug } from "@/lib/keywords";

// Recognise a printed keyword marker ("[Empower]", "[Flow]") — the exact bracket
// format cards are printed with and the same predicate the guides/keyword pages
// already query on (KeywordEntry.rulesContain). Built from KEYWORDS so a keyword
// with no verified rules page (see lib/keywords.ts) is never linked — no dead or
// misleading tooltip for a page that doesn't exist yet.
const MARKER_RE = /\[([A-Za-z][A-Za-z ]*)\]/g;

function KeywordChip({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const entry = KEYWORDS.find((k) => k.name.toLowerCase() === name.toLowerCase());
  if (!entry) return <>{`[${name}]`}</>;
  return (
    <span className="relative inline-block">
      <Link
        href={`/keywords/${entry.slug}`}
        className="font-semibold text-brand-400 underline decoration-dotted underline-offset-2 hover:text-brand-300"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          // First tap on touch devices reveals the definition instead of navigating;
          // a second tap (or a mouse click, which never sets `open` via touch) follows
          // the link — same UX pattern riftbound.gg's glossary tooltips use.
          if (!open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        [{name}]
      </Link>
      {open && (
        <span className="absolute bottom-full left-1/2 z-30 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-xs font-normal normal-case leading-snug text-slate-300 shadow-xl">
          {entry.directAnswer.slice(0, 140)}…{" "}
          <span className="text-brand-400">Read more →</span>
        </span>
      )}
    </span>
  );
}

// Wraps printed rules text so any "[Keyword]" marker becomes a hover/tap link to
// its /keywords/[slug] reference page — the exact text is never altered, only
// recognised bracket markers are turned into links. Server-safe fallback: renders
// plain text when nothing matches (no client JS needed for cards without a
// keyword this page has content for).
export function KeywordText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(MARKER_RE);
  if (parts.length === 1) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {parts.map((part, i) =>
        // Odd indices are the captured keyword name (one capture group → stride 2).
        i % 2 === 1 ? <KeywordChip key={i} name={part} /> : part
      )}
    </span>
  );
}
