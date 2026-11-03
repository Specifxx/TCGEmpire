// The family's Bluesky account (DECISIONS.md, "Bluesky auto-posting", 2026-11-02): two posts a day, each a link card
// to one sister site's self-updating page (price report, Black Friday deals, market report), rotating through all
// thirteen sites. Part of the passive-growth plan (owner, 2026-11-02: no Reddit posts or recurring work from him).
// Pure: tests/bluesky-post.test.ts. The script (scripts/bluesky-post.ts) fetches each page's own title, description
// and share image, so the card always says what the page says today; nothing is invented here.

export interface SitePages {
  name: string;
  url: string;
  /** Pages that update themselves every day. Black Friday paths are used only in season. */
  pages: string[];
  blackFriday: string;
  /** One or two hashtags people on Bluesky already follow for this hobby (no "#", no spaces). Discovery only. */
  tags: string[];
}

export const ROTATION: SitePages[] = [
  { name: "RiftCompare", url: "https://riftcompare.com", pages: ["/market/report"], blackFriday: "/black-friday", tags: ["Riftbound", "TCG"] },
  { name: "OP Compare", url: "https://opcompare.app", pages: ["/market"], blackFriday: "/black-friday", tags: ["OnePieceTCG", "TCG"] },
  { name: "KaeYoung", url: "https://kaeyoung.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["KBeauty", "Skincare"] },
  { name: "MTG Compare", url: "https://mtgcompare.app", pages: ["/us"], blackFriday: "/us/black-friday", tags: ["MTG", "MagicTheGathering"] },
  { name: "Compare Empire", url: "https://compareempire.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["Deals"] },
  { name: "Gundam Compare", url: "https://gundamcompare.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["GundamCardGame", "TCG"] },
  { name: "FigureCompare", url: "https://figurecompare.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["AnimeFigures", "Nendoroid"] },
  { name: "DexCompare", url: "https://dexcompare.app", pages: ["/us"], blackFriday: "/us/black-friday", tags: ["PokemonTCG"] },
  { name: "Lorcana Compare", url: "https://lorcanacompare.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["Lorcana", "DisneyLorcana"] },
  { name: "CamCompare", url: "https://www.camcompare.app", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["Photography", "Cameras"] },
  { name: "YGO Compare", url: "https://ygocompare.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["YuGiOh", "TCG"] },
  { name: "WargameCompare", url: "https://wargamecompare.com", pages: ["/price-report"], blackFriday: "/us/black-friday", tags: ["Warhammer", "Miniatures"] },
  { name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["CyberpunkTCG", "TCG"] },
  { name: "BandaiCompare", url: "https://bandaicompare.com", pages: ["/price-report"], blackFriday: "/black-friday", tags: ["UnionArena", "TCG"] },
];

/** Black Friday pages are posted from 1 November to the week after Cyber Monday (US Thanksgiving + 4 days + 7). */
export function blackFridaySeason(day: string): boolean {
  const y = Number(day.slice(0, 4));
  const nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const thanksgiving = 1 + ((4 - nov1 + 7) % 7) + 21;
  const end = new Date(Date.UTC(y, 10, thanksgiving + 4 + 7)).toISOString().slice(0, 10);
  return day >= `${y}-11-01` && day <= end;
}

/** The day's posts: `n` different sites, moving on two sites a day; each site alternates its pages. */
export function pickPosts(day: string, n = 2, rotation: SitePages[] = ROTATION): { site: SitePages; url: string }[] {
  const d = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const out: { site: SitePages; url: string }[] = [];
  for (let i = 0; i < Math.min(n, rotation.length); i++) {
    const k = d * n + i;
    const site = rotation[k % rotation.length];
    const pages = blackFridaySeason(day) ? [site.blackFriday, ...site.pages] : site.pages;
    out.push({ site, url: site.url + pages[Math.floor(k / rotation.length) % pages.length] });
  }
  return out;
}

/** Today's picks, then every other site in rotation order as stand-ins (its first page; Black Friday in season), for
 *  when a pick can't be read or was posted this week. The picks themselves are exactly `pickPosts(day, n)`. */
export function postCandidates(day: string, n = 2, rotation: SitePages[] = ROTATION): { site: SitePages; url: string }[] {
  const picks = pickPosts(day, n, rotation);
  const used = new Set(picks.map((p) => p.site.name));
  const last = rotation.indexOf(picks[picks.length - 1].site);
  const rest: { site: SitePages; url: string }[] = [];
  for (let i = 1; i <= rotation.length; i++) {
    const site = rotation[(last + i) % rotation.length];
    if (used.has(site.name)) continue;
    used.add(site.name);
    rest.push({ site, url: site.url + (blackFridaySeason(day) ? site.blackFriday : site.pages[0]) });
  }
  return [...picks, ...rest];
}

const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** og:title / og:description / og:image (falling back to <title> and the meta description) from a page's HTML. */
export function parseOg(html: string): { title: string | null; description: string | null; image: string | null } {
  const meta = (key: string) => {
    for (const m of html.matchAll(/<meta\s[^>]*>/gi)) {
      const tag = m[0];
      const k = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
      const v = /content=["']([^"']*)["']/i.exec(tag)?.[1];
      if (k?.toLowerCase() === key && v) return decode(v.trim());
    }
    return null;
  };
  const title = meta("og:title") ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)![1].trim()) : null);
  return { title, description: meta("og:description") ?? meta("description"), image: meta("og:image") };
}

/** Bluesky's limit is 300 graphemes; we stay under it in code points and cut on a word. Hashtags, when given, go on
 *  their own last line and are never cut: the description gives way to them. */
export function postText(title: string, description: string | null, max = 290, tags: string[] = []): string {
  const tail = tags.length ? `\n\n${tags.map((t) => `#${t}`).join(" ")}` : "";
  const room = max - [...tail].length;
  const full = description ? `${title}\n\n${description}` : title;
  const cps = [...full];
  if (cps.length <= room) return full + tail;
  const cut = cps.slice(0, room - 1).join("");
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), title.length)).trimEnd()}…${tail}`;
}

export interface TagFacet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: "app.bsky.richtext.facet#tag"; tag: string }[];
}

/** Rich-text facets that make each `#tag` in the text a real Bluesky hashtag. Offsets are UTF-8 bytes, as the
 *  protocol requires (the text holds "…", "é" and "£", so code-point offsets would land in the wrong place). */
export function tagFacets(text: string, tags: string[]): TagFacet[] {
  const enc = new TextEncoder();
  const out: TagFacet[] = [];
  for (const tag of tags) {
    const needle = `#${tag}`;
    const at = text.lastIndexOf(needle);
    if (at < 0) continue;
    const byteStart = enc.encode(text.slice(0, at)).length;
    out.push({ index: { byteStart, byteEnd: byteStart + enc.encode(needle).length }, features: [{ $type: "app.bsky.richtext.facet#tag", tag }] });
  }
  return out;
}
