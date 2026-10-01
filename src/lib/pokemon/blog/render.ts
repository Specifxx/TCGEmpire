// Turns a registry post into what the page renders: [[pk:…]] lines replaced
// by their computed blocks, {{fact}} tokens filled from those blocks' facts,
// and the eBay searches built for every market. Pure apart from reading the
// affiliate campaign through lib/affiliate.ts, which is why the page builds the
// links on the server and ships them to the client (EBAY_AFFILIATE_CAMPAIGN is
// not a NEXT_PUBLIC variable).
//
// A missing fact never prints as "undefined" or a blank: the line, summary
// bullet or FAQ answer that needed it is left out, the way every Pokémon page
// writes a sentence only when its fact exists. Against a real catalogue every
// token resolves (tests/pokemon-blog.test.ts); against an empty one the post
// still renders, with less in it.

import { COUNTRY_LIST, type Country } from "../../country";
import { ebayLabel, ebaySearchUrl } from "../../affiliate";
import { pokemonEbayQuery } from "../ebay-query";
import { asOfLabel } from "../value";
import { BLOCKS, isBlockId, type BlockCtx } from "./blocks";
import type { PokemonPost, PokemonPostFaq } from "./types";

const BLOCK_LINE = /^\s*\[\[pk:([a-z0-9-]+)\]\]\s*$/;
const FACT = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

/** Facts every post with blocks can quote, whatever its blocks. */
export const COMMON_FACTS = ["asOf"] as const;

/** The block ids a post places, in body order (unknown ids included, for the test to catch). */
export function postBlockIds(post: Pick<PokemonPost, "body">): string[] {
  const out: string[] = [];
  for (const line of post.body.split("\n")) {
    const m = BLOCK_LINE.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Every {{fact}} key a post's body, summary and FAQ use. */
export function postFactKeys(post: Pick<PokemonPost, "body" | "summary" | "faq">): string[] {
  const texts = [post.body, ...(post.summary ?? []), ...(post.faq ?? []).flatMap((f) => [f.q, f.a])];
  const keys = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(FACT)) keys.add(m[1]);
  return [...keys];
}

/** `text` with its tokens filled, or null when any fact is missing. */
export function fillTokens(text: string, facts: Readonly<Record<string, string>>): string | null {
  let missing = false;
  const out = text.replace(FACT, (_, key: string) => {
    const v = facts[key];
    if (v == null || v === "") {
      missing = true;
      return "";
    }
    return v;
  });
  return missing ? null : out;
}

export interface FilledPokemonPost {
  /** Markdown with blocks in place and tokens filled. */
  body: string;
  summary: string[];
  faq: PokemonPostFaq[];
  facts: Record<string, string>;
  /** Body lines, summary bullets and FAQ answers left out for a missing fact. */
  dropped: number;
}

const POST_LINK = /\[([^\]]+)\]\(\/pokemon\/blog\/([a-z0-9-]+)(#[^)]*)?\)/g;

/**
 * Links to other posts that cannot be opened here become their plain label:
 * posts are published one at a time, and a published post must not link a
 * draft that 404s in production. The link comes back by itself once its
 * target is published.
 */
export function unlinkPosts(md: string, linkable: (slug: string) => boolean): string {
  return md.replace(POST_LINK, (whole, label: string, slug: string) => (linkable(slug) ? whole : label));
}

/**
 * Fill a post. `ctx` is null when the post places no block (no catalogue is
 * read for it); a block line is then left out. `linkable` says which other
 * posts may be linked (all of them by default).
 */
export function fillPost(post: PokemonPost, ctx: BlockCtx | null, linkable: (slug: string) => boolean = () => true): FilledPokemonPost {
  const facts: Record<string, string> = {};
  if (ctx) {
    const asOf = asOfLabel(ctx.catalog.pricesAsOf);
    if (asOf) facts.asOf = asOf;
  }
  // Blocks first, so a token above a block can quote it.
  const blockMd = new Map<string, string>();
  if (ctx) {
    for (const id of postBlockIds(post)) {
      if (!isBlockId(id) || blockMd.has(id)) continue;
      const out = BLOCKS[id](ctx);
      blockMd.set(id, out.markdown);
      Object.assign(facts, out.facts);
    }
  }

  let dropped = 0;
  const lines: string[] = [];
  for (const line of post.body.split("\n")) {
    const m = BLOCK_LINE.exec(line);
    if (m) {
      const md = blockMd.get(m[1]);
      if (md) lines.push("", md, "");
      continue;
    }
    const filled = fillTokens(line, facts);
    if (filled == null) dropped++;
    else lines.push(unlinkPosts(filled, linkable));
  }

  const summary: string[] = [];
  for (const s of post.summary ?? []) {
    const filled = fillTokens(s, facts);
    if (filled == null) dropped++;
    else summary.push(unlinkPosts(filled, linkable));
  }
  const faq: PokemonPostFaq[] = [];
  for (const f of post.faq ?? []) {
    const q = fillTokens(f.q, facts);
    const a = fillTokens(f.a, facts);
    if (q == null || a == null) dropped++;
    else faq.push({ q, a: unlinkPosts(a, linkable) });
  }

  return { body: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), summary, faq, facts, dropped };
}

/** Plain text of an inline-markdown string, for JSON-LD (links keep their label). */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export interface EbayLink {
  label: string;
  href: string;
}

const DEFAULT_SEARCHES = [{ label: "Pokémon sealed", query: "sealed" }];

/**
 * The post's eBay searches for all six markets, keyed by market. The page is
 * ISR and reads no cookie, so it ships every market's links and
 * PokemonMarketEbayPanel picks the visitor's on the client. EPN's customid
 * carries "pkmn-blog" so blog clicks are separable in the network's reports.
 */
export function postEbayLinks(post: Pick<PokemonPost, "ebay">): Record<Country, EbayLink[]> {
  const searches = post.ebay?.length ? post.ebay : DEFAULT_SEARCHES;
  const out = {} as Record<Country, EbayLink[]>;
  for (const c of COUNTRY_LIST) {
    out[c.code] = searches.map((s) => ({
      label: `${s.label} on ${ebayLabel(c.code)}`,
      href: ebaySearchUrl(c.code, pokemonEbayQuery(s.query), "pkmn-blog"),
    }));
  }
  return out;
}
