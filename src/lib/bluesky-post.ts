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
}

export const ROTATION: SitePages[] = [
  { name: "RiftCompare", url: "https://riftcompare.com", pages: ["/market/report"], blackFriday: "/black-friday" },
  { name: "OP Compare", url: "https://opcompare.app", pages: ["/market"], blackFriday: "/black-friday" },
  { name: "KaeYoung", url: "https://kaeyoung.com", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "MTG Compare", url: "https://mtgcompare.app", pages: ["/us"], blackFriday: "/us/black-friday" },
  { name: "Compare Empire", url: "https://compareempire.com", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "Gundam Compare", url: "https://gundamcompare.com", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "FigureCompare", url: "https://figurecompare.com", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "DexCompare", url: "https://dexcompare.app", pages: ["/us"], blackFriday: "/us/black-friday" },
  { name: "Lorcana Compare", url: "https://lorcanacompare.com", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "CamCompare", url: "https://www.camcompare.app", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "YGO Compare", url: "https://ygocompare.com", pages: ["/price-report"], blackFriday: "/black-friday" },
  { name: "WargameCompare", url: "https://wargamecompare.com", pages: ["/price-report"], blackFriday: "/us/black-friday" },
  { name: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", pages: ["/price-report"], blackFriday: "/black-friday" },
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

/** Bluesky's limit is 300 graphemes; we stay under it in code points and cut on a word. */
export function postText(title: string, description: string | null, max = 290): string {
  const full = description ? `${title}\n\n${description}` : title;
  const cps = [...full];
  if (cps.length <= max) return full;
  const cut = cps.slice(0, max - 1).join("");
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), title.length)).trimEnd()}…`;
}
