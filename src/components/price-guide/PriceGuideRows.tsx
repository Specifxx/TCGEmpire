"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { PriceGuideChange } from "./PriceGuideChange";

// The price guide's <tbody>, as a CLIENT component fed one compact object a
// row. Still server-rendered HTML (SSR), so crawlers and no-JS readers get the
// whole table; what changes is the inline RSC payload. Rendered by a server
// component, every row's element tree — tags, classNames, chip styles — was
// serialised a SECOND time into the document's __next_f pushes (~2.2 KB a row,
// escaped), which put the clean 100-row page at ~786 KB against the brief's
// ≤450 KB budget (DECISIONS.md, 2026-10-02). As props, a row is ~250 B.
//
// Everything that needs server-only data (set names, rarity rules, money
// formatting, card-art URLs) is resolved in PriceGuideTable before it gets
// here, so this file imports nothing but React, next/link and the dash.

/** One row: short keys on purpose — each is written once per row into the RSC payload. */
export interface GuideRowProps {
  /** Row key (card id). */
  k: string;
  /** Card page href. */
  h: string;
  /** Thumbnail src (one small rendition), or null. */
  i: string | null;
  /** Display name. */
  n: string;
  /** Set name. */
  s: string;
  /** Collector number. */
  c: string;
  /** Rarity label and colour. */
  r: string;
  rc: string;
  /** Domain label and colour, card type. */
  d: string;
  dc: string;
  t: string;
  /** Formatted price, or null when not in stock. */
  p: string | null;
  /** In-stock store count. */
  st: number;
  /** 7-day and 30-day moves (%), or null. */
  w: number | null;
  m: number | null;
}

// The Badge.tsx chips, inlined (that file pulls lib/constants into the
// client bundle). Alpha suffixes: rarity 0.16 → 29, domain 0.18 → 2e.
function Chip({ label, color, alpha, dot }: { label: string; color: string; alpha: string; dot?: boolean }) {
  return (
    <span className="chip data-ink" style={{ backgroundColor: color + alpha, "--data-ink": color } as CSSProperties}>
      {dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
  );
}

export function PriceGuideRows({ rows, showD30 }: { rows: GuideRowProps[]; showD30: boolean }) {
  return (
    <tbody className="divide-y divide-ink-800">
      {rows.map((r) => (
        <tr key={r.k}>
          <td className="pg-c1">
            {/* The whole cell is the link: the name, the set and the
                collector number, so every anchor is distinct (two
                printings of one card never share link text) and the
                tap target is the full row height on a phone. */}
            <Link href={r.h} prefetch={false} className="pg-a">
              {r.i ? (
                // One 320w rendition, no srcSet: a 28px thumbnail is ≤84
                // device pixels even at 3x.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.i} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="pg-i" />
              ) : (
                <span aria-hidden="true" className="pg-i" />
              )}
              <span className="pg-b">
                <span className="pg-nm">{r.n}</span>
                <span className="pg-sub">
                  <span className="truncate">
                    {r.s} · <span className="num">{r.c}</span>
                  </span>
                  {/* Phones and sm: the Rarity column is hidden, so the chip rides here. */}
                  <span className="shrink-0 md:hidden">
                    <Chip label={r.r} color={r.rc} alpha="29" />
                  </span>
                </span>
              </span>
            </Link>
          </td>
          <td className="pg-md">
            <Chip label={r.r} color={r.rc} alpha="29" />
          </td>
          <td className="pg-x2">
            <span className="pg-sub">
              <Chip label={r.d} color={r.dc} alpha="2e" dot />
              <span className="truncate text-slate-400" title={`${r.d} ${r.t}`}>
                {r.t}
              </span>
            </span>
          </td>
          <td className="num pg-p">
            {r.p != null ? <b className="text-white">{r.p}</b> : <PriceGuideChange pct={null} label="Not in stock" />}
            {/* Phones only: the 7-day column is hidden, so a move rides
                under the price (and nothing, rather than a second dash,
                when there is none yet). */}
            {r.w != null && (
              <span className="pg-pc">
                <PriceGuideChange pct={r.w} />
              </span>
            )}
          </td>
          <td className="num pg-n pg-sm">
            <PriceGuideChange pct={r.w} />
          </td>
          {showD30 && (
            <td className="num pg-n pg-x2">
              <PriceGuideChange pct={r.m} />
            </td>
          )}
          <td className="num pg-s pg-sm">{r.st > 0 ? r.st : <span className="text-slate-600">—</span>}</td>
        </tr>
      ))}
    </tbody>
  );
}
