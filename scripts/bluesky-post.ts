// Posts the day's two link cards to the family's Bluesky account (lib/bluesky-post.ts; DECISIONS.md, "Bluesky
// auto-posting", 2026-11-02). Run by .github/workflows/bluesky-post.yml once a day.
//
//   BLUESKY_HANDLE        the account's handle, e.g. compareempire.bsky.social
//   BLUESKY_APP_PASSWORD  an app password (Settings → Privacy and security → App passwords), never the login password
//
// Either missing is a green no-op that prints what it would post. A page that can't be read is skipped (logged);
// Bluesky refusing a post, or every page failing, fails the run so the ops monitor sees it.
import { parseOg, postCandidates, postText, tagFacets } from "../src/lib/bluesky-post";

const PDS = "https://bsky.social/xrpc";
const UA = { "User-Agent": "CompareEmpire-bluesky/1 (+https://compareempire.com)" };

async function xrpc<T>(method: string, body: unknown, token?: string): Promise<T> {
  const r = await fetch(`${PDS}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!r.ok) throw new Error(`Bluesky ${method} answered ${r.status}: ${j.error ?? ""} ${j.message ?? ""}`.trim());
  return j;
}

/** Link-card URLs the account posted in the last `days` days, so a re-run or a manual run never repeats one. */
async function recentLinks(did: string, token: string, days = 6): Promise<Set<string>> {
  const r = await fetch(`${PDS}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=50&filter=posts_no_replies`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Bluesky getAuthorFeed answered ${r.status}`);
  const j = (await r.json()) as { feed?: { post?: { record?: { createdAt?: string; embed?: { external?: { uri?: string } } } } }[] };
  const since = Date.now() - days * 86_400_000;
  const out = new Set<string>();
  for (const it of j.feed ?? []) {
    const rec = it.post?.record;
    const uri = rec?.embed?.external?.uri;
    if (uri && Date.parse(rec?.createdAt ?? "") >= since) out.add(uri);
  }
  return out;
}

async function thumb(url: string | null, token: string): Promise<unknown | undefined> {
  if (!url) return undefined;
  try {
    const r = await fetch(url, { headers: UA });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/^image\/(png|jpe?g|webp)/.test(type)) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > 950_000) return undefined; // Bluesky's blob limit is about 1 MB; a card without a picture is fine
    const up = await fetch(`${PDS}/com.atproto.repo.uploadBlob`, { method: "POST", headers: { "Content-Type": type, Authorization: `Bearer ${token}` }, body: bytes });
    if (!up.ok) return undefined;
    return ((await up.json()) as { blob: unknown }).blob;
  } catch {
    return undefined;
  }
}

async function main() {
  const day = new Date().toISOString().slice(0, 10);
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  const WANT = 2;
  // Today's two sites first, then the rest of the rotation in order as stand-ins: a site that is down or blocks the
  // fetch (CamCompare's bot challenge answers 429), or a link already posted this week, gives way to the next one.
  const candidates = postCandidates(day, WANT);
  const session = handle && password ? await xrpc<{ accessJwt: string; did: string }>("com.atproto.server.createSession", { identifier: handle, password }) : null;
  const already = session ? await recentLinks(session.did, session.accessJwt) : new Set<string>();
  let posted = 0;
  let shown = 0;
  let failed = 0;
  for (const { site, url } of candidates) {
    if (posted + shown >= WANT) break;
    if (already.has(url)) {
      console.log(`Skipped ${url}: posted in the last six days.`);
      continue;
    }
    let html: string;
    try {
      const r = await fetch(url, { headers: UA, redirect: "follow" });
      if (!r.ok) throw new Error(`answered ${r.status}`);
      html = await r.text();
    } catch (e) {
      failed++;
      console.log(`Skipped ${url}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const og = parseOg(html);
    if (!og.title) {
      failed++;
      console.log(`Skipped ${url}: no title.`);
      continue;
    }
    const text = postText(og.title, og.description, 290, site.tags);
    if (!session) {
      console.log(`[dry run: BLUESKY_HANDLE / BLUESKY_APP_PASSWORD not set] ${site.name}: ${url}\n${text}\n`);
      shown++;
      continue;
    }
    const image = await thumb(og.image, session.accessJwt);
    await xrpc("com.atproto.repo.createRecord", {
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        facets: tagFacets(text, site.tags),
        langs: ["en"],
        createdAt: new Date().toISOString(),
        embed: { $type: "app.bsky.embed.external", external: { uri: url, title: og.title, description: og.description ?? "", ...(image ? { thumb: image } : {}) } },
      },
    }, session.accessJwt);
    posted++;
    console.log(`Posted ${site.name}: ${url}`);
  }
  if (posted + shown === 0 && failed > 0) throw new Error("No page in the rotation could be posted today.");
  console.log(session ? `${posted} posted, ${failed} skipped.` : "Dry run done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
