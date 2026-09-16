"use client";

import Link from "next/link";
import { useId } from "react";
import { KEYWORDS, keywordSlug } from "@/lib/keywords";
import { Tooltip } from "./ui/Tooltip";

// Recognise a printed keyword marker ("[Empower]", "[Flow]") — the exact bracket
// format cards are printed with and the same predicate the guides/keyword pages
// already query on (KeywordEntry.rulesContain). Built from KEYWORDS so a keyword
// with no verified rules page (see lib/keywords.ts) is never linked — no dead or
// misleading tooltip for a page that doesn't exist yet.
const MARKER_RE = /\[([A-Za-z][A-Za-z ]*)\]/g;

function KeywordChip({ name }: { name: string }) {
  const id = useId();
  const entry = KEYWORDS.find((k) => k.name.toLowerCase() === name.toLowerCase());
  if (!entry) return <>{`[${name}]`}</>;
  return (
    <Tooltip
      id={id}
      content={
        <>
          {entry.directAnswer.slice(0, 140)}…{" "}
          <span className="text-brand-400">Read more →</span>
        </>
      }
    >
      {({ revealed, reveal, ...trigger }) => (
        <Link
          href={`/keywords/${entry.slug}`}
          className="font-semibold text-brand-400 underline decoration-dotted underline-offset-2 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          {...trigger}
          onClick={(e) => {
            // First tap/focus on touch devices reveals the definition instead of
            // navigating; a second tap (or a mouse click, which never reveals via
            // touch) follows the link — same UX pattern riftbound.gg's glossary
            // tooltips use.
            if (!revealed) {
              e.preventDefault();
              reveal();
            }
          }}
        >
          [{name}]
        </Link>
      )}
    </Tooltip>
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
