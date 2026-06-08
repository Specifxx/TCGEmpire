import { z } from "zod";
import { prisma } from "./db";
import { normalizeSearch } from "./format";
import { pickPrice, type Country } from "./country";

export const forumItemSchema = z.object({
  name: z.string().min(1).max(120),
  setCode: z.string().max(8).optional(),
  condition: z.string().max(16).optional(),
  qty: z.number().int().min(1).max(99).optional(),
});

export const forumSchema = z.object({
  kind: z.enum(["WTB", "WTS", "DISCUSSION"]),
  title: z.string().min(4, "Add a short title"), // the only required field, no max
  price: z.union([z.number(), z.string()]).optional(),
  items: z.array(forumItemSchema).max(60).optional(),
  body: z.string().optional(), // no length limit
  contact: z.string().max(160).optional(),
  country: z.string().max(60).optional(),
  state: z.string().max(60).optional(),
  website: z.string().optional(), // honeypot
});

export type ForumInput = z.infer<typeof forumSchema>;

export interface PreparedForumItem {
  name: string;
  setCode: string | null;
  condition: string | null;
  qty: number;
  marketCents: number | null;
}

// Validate-and-normalise a forum post payload: resolves each listed card's current
// market value server-side (authoritative) and sums them. Shared by create + edit.
export async function prepareForumData(d: ForumInput, country: Country = "AU") {
  const isDiscussion = d.kind === "DISCUSSION";

  let items: PreparedForumItem[] = [];
  let marketCents: number | null = null;
  if (!isDiscussion && d.items?.length) {
    const norms = Array.from(new Set(d.items.map((i) => normalizeSearch(i.name))));
    const cards = await prisma.card.findMany({
      where: { nameNormalized: { in: norms }, isPromo: false },
      select: { nameNormalized: true, lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true },
    });
    // Use the poster's market price for each item (AUD/NZD/USD).
    const priceByNorm = new Map<string, number>();
    for (const c of cards) {
      const p = pickPrice(c, country);
      if (p != null && !priceByNorm.has(c.nameNormalized)) priceByNorm.set(c.nameNormalized, p);
    }
    let sum = 0;
    let anyPriced = false;
    items = d.items.map((i) => {
      const mc = priceByNorm.get(normalizeSearch(i.name)) ?? null;
      const qty = i.qty ?? 1;
      if (mc != null) { sum += mc * qty; anyPriced = true; }
      return { name: i.name.trim(), setCode: i.setCode?.toUpperCase() || null, condition: i.condition || null, qty, marketCents: mc };
    });
    marketCents = anyPriced ? sum : null;
  }

  const raw = d.price != null ? `${d.price}`.replace(/[^0-9.]/g, "") : "";
  const dollars = raw ? parseFloat(raw) : NaN;
  const priceCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : null;

  return {
    fields: {
      kind: d.kind,
      title: d.title.trim(),
      cardName: null,
      setCode: null,
      condition: null,
      priceCents,
      marketCents,
      body: (d.body ?? "").trim(),
      contact: (d.contact ?? "").trim(),
      country: isDiscussion ? null : d.country?.trim() || null,
      state: isDiscussion ? null : d.state?.trim() || null,
    },
    items,
  };
}
