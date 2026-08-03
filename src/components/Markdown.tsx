import React from "react";
import { Picture } from "./Picture";
import { headingId } from "@/lib/toc";

// Minimal, dependency-free markdown renderer for our own article content.
// Supports: ## / ### headings (with stable anchor ids, so the article TOC and
// deep links work), paragraphs, - and 1. lists, > blockquotes, GFM pipe tables,
// --- rules, a block-level image on its own line (![alt](/src.png)), and inline
// **bold**, [links](url) and `code`. (We author the content, so no sanitising of
// arbitrary HTML is needed.)
//
// TABLES were added for the marketplace-comparison and fee-breakdown articles:
// answer engines quote a well-formed <table> far more readily than the same facts
// in prose, and every one of the AI-visibility target queries ("top 10 Riftbound
// TCG marketplaces", "Riftbound card price comparison") is answered by a table.

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
  const isBreak = (l: string) => /^(#{2,3}\s|[-*]\s|\d+\.\s|---\s*$|!\[|\||>\s)/.test(l.trim());

  // Mirrors extractToc()'s duplicate-suffix rule so heading ids and TOC hrefs
  // agree even when two sections share a title.
  const headingSeen = new Map<string, number>();
  const nextHeadingId = (text: string) => {
    const base = headingId(text);
    const n = (headingSeen.get(base) ?? 0) + 1;
    headingSeen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

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
          {/* <Picture> serves the WebP rendition with the original as fallback and
              stamps the intrinsic width/height from public/image-manifest.json, so
              an article illustration can't shift the layout as it loads. */}
          <Picture
            src={src}
            alt={alt}
            sizes="(max-width: 768px) 100vw, 768px"
            className="h-auto w-full rounded-xl border border-ink-700"
          />
          {alt && <figcaption className="mt-2 text-center text-xs text-slate-500">{alt}</figcaption>}
        </figure>
      );
      i++;
      continue;
    }
    // Headings carry the same anchor id the TOC links to (lib/toc.ts), with the
    // -2/-3 suffix applied identically so a repeated heading text can't collide.
    if (trimmed.startsWith("### ")) {
      const text = trimmed.slice(4);
      blocks.push(<h3 key={key} id={nextHeadingId(text)} className="mb-2 mt-6 scroll-mt-24 text-base font-bold text-white">{inline(text, `h${key++}`)}</h3>);
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      const text = trimmed.slice(3);
      blocks.push(<h2 key={key} id={nextHeadingId(text)} className="mb-3 mt-8 scroll-mt-24 text-xl font-extrabold text-white">{inline(text, `h${key++}`)}</h2>);
      i++;
      continue;
    }

    // GFM pipe table: a header row, a |---|---| separator, then body rows.
    if (trimmed.startsWith("|") && /^\|?[\s:-]*\|[\s|:-]*$/.test((lines[i + 1] ?? "").trim()) && (lines[i + 1] ?? "").includes("-")) {
      const cells = (row: string) =>
        row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const head = cells(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push(
        // Wide tables scroll inside their own container rather than making the
        // whole article scroll sideways on a phone.
        <div key={key} className="my-5 overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-ink-850">
                {head.map((c, j) => (
                  <th key={j} scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">
                    {inline(c, `th${key}-${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="odd:bg-ink-900/40">
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-ink-800 px-3 py-2 align-top text-slate-300">
                      {inline(c, `td${key}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      key++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoted.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={key} className="my-5 border-l-2 border-brand-500 bg-ink-900/60 px-4 py-3 text-slate-300">
          {inline(quoted.join(" "), `q${key++}`)}
        </blockquote>
      );
      continue;
    }

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
