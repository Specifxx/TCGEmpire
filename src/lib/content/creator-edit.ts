// CREATORS EDIT THEIR OWN CARD (2026-10-22, owner: "for future have the ability
// for creators to add it themselves"). DECISIONS.md, "Creators edit their own
// card through a private link".
//
// The static CREATORS list (creators.ts) stays the source of who is listed: a
// person still agrees each partnership. What a creator can change is their own
// card's content — blurb, links, tip page, tags, region — through a private
// link the owner makes at /admin/creators (/creators/edit/<token>). The token is
// stored only as its sha256. An edit is a CreatorProfileEdit row that overrides
// those fields; name, slug, avatar and code stay the owner's.
//
// PURE: validation and merging only, so tests and the client form share it.
import type { Creator, CreatorLink, CreatorPlatform } from "./creators";

export const EDIT_PLATFORMS: CreatorPlatform[] = ["YouTube", "Twitch", "TikTok", "Instagram", "X", "Discord", "Website", "Email"];
export const MAX_LINKS = 6;
export const MAX_BLURB = 140;
export const MAX_TAGS = 3;

/** The hosts a link on each platform may point at. Website takes any https host. */
const HOSTS: Record<CreatorPlatform, string[] | null> = {
  YouTube: ["youtube.com", "youtu.be"],
  Twitch: ["twitch.tv"],
  TikTok: ["tiktok.com"],
  Instagram: ["instagram.com"],
  X: ["x.com", "twitter.com"],
  Discord: ["discord.gg", "discord.com"],
  Website: null,
  Email: null,
};

/** Share-sheet tracking params a pasted link carries (YouTube `si`, Instagram `igsh`…). */
const TRACKING = /^(si|igsh|igshid|utm_.*|_t|_r|is_from_webapp|sender_device|feature|rpxt|psln|fbclid|s|t)$/i;

/** A clean https URL on the platform's domain, or null. Accepts a bare "www.…" paste. */
export function cleanLinkUrl(platform: CreatorPlatform, raw: string): string | null {
  let s = raw.trim();
  if (!s || s.length > 300) return null;
  // Email: a public contact address the creator chose to list, as a mailto: link.
  if (platform === "Email") {
    const addr = s.replace(/^mailto:/i, "").split("?")[0]!.trim().toLowerCase();
    return /^[^\s@/:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(addr) ? `mailto:${addr}` : null;
  }
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const hosts = HOSTS[platform];
  if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (!hosts && !host.includes(".")) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.hash = "";
  return u.toString();
}

/** "@handle" from a profile URL where the path makes it obvious. */
export function handleFromUrl(url: string): string | undefined {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0];
    if (!seg) return undefined;
    return seg.startsWith("@") ? seg : `@${seg}`;
  } catch {
    return undefined;
  }
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

export interface ProfileEdit {
  blurb: string;
  links: CreatorLink[];
  tipUrl: string | null;
  tags: string[];
  region: string | null;
}

export type EditResult = { ok: true; edit: ProfileEdit } | { ok: false; error: string };

export function validateProfileEdit(input: unknown): EditResult {
  const b = (input ?? {}) as Record<string, unknown>;
  const blurb = text(b.blurb, MAX_BLURB + 1);
  if (blurb.length < 10) return { ok: false, error: "Write a one-line description (at least 10 characters)." };
  if (blurb.length > MAX_BLURB) return { ok: false, error: `Keep the description to ${MAX_BLURB} characters.` };
  const rawLinks = Array.isArray(b.links) ? b.links : [];
  const links: CreatorLink[] = [];
  for (const r of rawLinks) {
    const l = (r ?? {}) as Record<string, unknown>;
    if (!text(l.url, 300)) continue;
    const platform = EDIT_PLATFORMS.find((p) => p === l.platform);
    if (!platform) return { ok: false, error: "Pick a platform for each link." };
    const url = cleanLinkUrl(platform, String(l.url));
    if (!url) return { ok: false, error: `That ${platform} link doesn't look right: ${text(l.url, 80)}` };
    const handle = text(l.handle, 40) || (platform === "Website" ? undefined : platform === "Email" ? url.slice(7) : handleFromUrl(url));
    links.push({ platform, url, ...(handle ? { handle } : {}) });
  }
  if (!links.length) return { ok: false, error: "Add at least one link." };
  if (links.length > MAX_LINKS) return { ok: false, error: `At most ${MAX_LINKS} links.` };
  let tipUrl: string | null = null;
  if (text(b.tipUrl, 300)) {
    tipUrl = cleanLinkUrl("Website", String(b.tipUrl));
    if (!tipUrl) return { ok: false, error: "The tip page must be an https link." };
  }
  const rawTags = Array.isArray(b.tags) ? b.tags : typeof b.tags === "string" ? b.tags.split(",") : [];
  const tags = [...new Set(rawTags.map((t) => text(t, 24)).filter(Boolean))];
  if (tags.length > MAX_TAGS) return { ok: false, error: `At most ${MAX_TAGS} tags.` };
  const region = text(b.region, 20) || null;
  return { ok: true, edit: { blurb, links, tipUrl, tags, region } };
}

/** The stored row's shape (JSON/comma strings), as CreatorProfileEdit holds it. */
export interface StoredEdit {
  slug: string;
  blurb: string | null;
  links: string | null;
  tipUrl: string | null;
  tags: string | null;
  region: string | null;
  editedAt: Date | null;
}

/** The static creator with a creator's own saved edit laid over it. Re-validates the
 *  stored row, so a bad row can only fall back to the static card. */
export function applyEdit(c: Creator, row: StoredEdit | undefined): Creator {
  if (!row?.editedAt) return c;
  let links: unknown = [];
  try {
    links = JSON.parse(row.links ?? "[]");
  } catch {
    return c;
  }
  const v = validateProfileEdit({ blurb: row.blurb, links, tipUrl: row.tipUrl, tags: row.tags ?? "", region: row.region });
  if (!v.ok) return c;
  const { tipUrl, region, tags, ...rest } = v.edit;
  return {
    ...c,
    ...rest,
    tipUrl: tipUrl ?? undefined,
    region: region ?? undefined,
    tags: tags.length ? tags : undefined,
  };
}
