import React from "react";

// Minimal, dependency-free markdown renderer for our own article content.
// Supports: ## / ### headings, paragraphs, - and 1. lists, --- rules, a block-level
// image on its own line (![alt](/src.png)), and inline **bold**, [links](url) and
// `code`. (We author the content, so no sanitising of arbitrary HTML is needed.)

function inline(text: string, kp: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: **bold** before *italic* so the double-star wins.
  const re = /(\*\*([^*]+)\*\*)|(\*([^*\n]+)\*)|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      // Recurse so nested marks render — e.g. **[link](url)** is a linked bold,
      // not the literal "[link](url)" text.
      nodes.push(<strong key={`${kp}b${i}`} className="font-semibold text-white">{inline(m[2], `${kp}b${i}_`)}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={`${kp}i${i}`} className="italic text-slate-200">{inline(m[4], `${kp}i${i}_`)}</em>);
    } else if (m[5]) {
      const href = m[7];
      const ext = /^https?:/i.test(href);
      nodes.push(
        <a
          key={`${kp}l${i}`}
          href={href}
          className="text-brand-400 underline hover:text-brand-300"
          {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {inline(m[6], `${kp}l${i}_`)}
        </a>
      );
    } else if (m[8]) {
      nodes.push(
        <code key={`${kp}c${i}`} className="rounded bg-ink-800 px-1 py-0.5 text-[0.85em] text-slate-200">
          {m[9]}
        </code>
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").trim().split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const isBreak = (l: string) => /^(#{2,3}\s|[-*]\s|\d+\.\s|---\s*$|!\[)/.test(l.trim());

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (trimmed === "---") { blocks.push(<hr key={key++} className="my-6 border-ink-700" />); i++; continue; }

    // Block-level image on its own line: ![alt/caption](/src.png)
    const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      const [, alt, src] = img;
      blocks.push(
        <figure key={key++} className="my-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" decoding="async" className="w-full rounded-xl border border-ink-700" />
          {alt && <figcaption className="mt-2 text-center text-xs text-slate-500">{alt}</figcaption>}
        </figure>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) { blocks.push(<h3 key={key} className="mb-2 mt-6 text-base font-bold text-white">{inline(trimmed.slice(4), `h${key++}`)}</h3>); i++; continue; }
    if (trimmed.startsWith("## ")) { blocks.push(<h2 key={key} className="mb-3 mt-8 text-xl font-extrabold text-white">{inline(trimmed.slice(3), `h${key++}`)}</h2>); i++; continue; }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      blocks.push(
        <ul key={key} className="my-3 list-disc space-y-1 pl-5 text-slate-300">
          {items.map((it, j) => <li key={j}>{inline(it, `u${key}-${j}`)}</li>)}
        </ul>
      );
      key++;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++; }
      blocks.push(
        <ol key={key} className="my-3 list-decimal space-y-1 pl-5 text-slate-300">
          {items.map((it, j) => <li key={j}>{inline(it, `o${key}-${j}`)}</li>)}
        </ol>
      );
      key++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBreak(lines[i])) { para.push(lines[i].trim()); i++; }
    blocks.push(<p key={key} className="my-3 leading-relaxed text-slate-300">{inline(para.join(" "), `p${key++}`)}</p>);
  }

  return <div className="text-[15px]">{blocks}</div>;
}
