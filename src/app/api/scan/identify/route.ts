import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { cardTileSelect } from "@/lib/cards";
import { SETS } from "@/lib/constants";
import type { Country } from "@/lib/country";

export const dynamic = "force-dynamic";

const COUNTRIES = ["AU", "NZ", "US", "UK"] as const;
const schema = z.object({
  text: z.string().min(1).max(400),
  country: z.enum(COUNTRIES).optional(),
});

const SET_CODES = SETS.map((s) => s.code); // OGN, OGS, SFD, UNL, VEN
// Set total → set code, so we can recover the set even if the 3-letter code is
// misread (the "/298" part is large and printed plainly).
const TOTAL_TO_SET: Record<string, string> = { "298": "OGN", "219": "UNL" };

type Parsed = { setCode: string | null; num: number | null; letter: string | null; total: string | null };

// Pull the set code + collector number out of OCR text from the card's bottom-left.
function parseIdentifier(raw: string): Parsed {
  const text = raw.toUpperCase().replace(/[^A-Z0-9/*]+/g, " ");

  // Set code: a known 3-letter code appearing as a token.
  let setCode: string | null = null;
  for (const code of SET_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(text) || text.replace(/\s+/g, "").includes(code)) {
      setCode = code;
      break;
    }
  }

  // Collector number: "039/298" (optionally "112A/298" or "231*/219").
  let num: number | null = null;
  let letter: string | null = null;
  let total: string | null = null;
  const m = text.match(/(\d{1,3})\s*([A-Z])?\s*\*?\s*\/\s*(\d{2,3})/);
  if (m) {
    num = parseInt(m[1], 10);
    letter = m[2] ? m[2].toLowerCase() : null;
    total = m[3];
  } else {
    // No slash read — fall back to the first 2–3 digit run.
    const m2 = text.match(/\b(\d{2,3})\b/);
    if (m2) num = parseInt(m2[1], 10);
  }

  if (!setCode && total && TOTAL_TO_SET[total]) setCode = TOTAL_TO_SET[total];
  return { setCode, num, letter, total };
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const country = (parsed.data.country ?? "AU") as Country;
  const id = parseIdentifier(parsed.data.text);

  if (id.num == null) {
    return NextResponse.json({ cards: [], parsed: id, reason: "no-number" });
  }

  const select = cardTileSelect(country);
  // Pull the candidate pool (a whole set is small) and match the numeric part of
  // the stored "NNN/total" collector number — robust to OCR dropping leading zeros.
  const pool = await prisma.card.findMany({
    where: id.setCode ? { setCode: id.setCode } : {},
    select: { ...select, collectorNumber: true },
  });

  const matches = pool.filter((c) => {
    const seg = c.collectorNumber.split("/")[0]; // e.g. "039" or "112a" or "231*"
    const segNum = parseInt(seg.replace(/[^0-9]/g, ""), 10);
    if (segNum !== id.num) return false;
    const segLetter = seg.match(/([a-z])/i)?.[1]?.toLowerCase() ?? null;
    // If OCR read an alt-art letter, require it; otherwise prefer the base print.
    if (id.letter) return segLetter === id.letter;
    return true;
  });

  // Base print (no variant letter / star) first so the common case leads.
  matches.sort((a, b) => {
    const av = /[a-z*]/i.test(a.collectorNumber.split("/")[0]) ? 1 : 0;
    const bv = /[a-z*]/i.test(b.collectorNumber.split("/")[0]) ? 1 : 0;
    return av - bv;
  });

  return NextResponse.json({ cards: matches.slice(0, 6), parsed: id });
}
