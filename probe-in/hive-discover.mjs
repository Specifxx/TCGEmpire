// Temporary: how many Card Hive singles map to one of our printings through Riot's gallery image. Removed before merge.
import fs from "node:fs";
const out = []; const log = (...a) => out.push(a.join(" "));
const html = await (await fetch("https://playriftbound.com/en-us/card-gallery/", { headers: { "user-agent": "Mozilla/5.0 (RiftCompare probe)" } })).text();
const nd = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
const gallery = new Map(); // hash -> {id,name,publicCode}
const walk = (n) => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== "object") return;
  if (typeof n.id === "string" && typeof n.name === "string" && n.cardImage?.url && n.set?.value?.id) {
    const h = /game_data_live\/([0-9a-f]{40})/.exec(n.cardImage.url)?.[1];
    if (h && !gallery.has(h)) gallery.set(h, { id: n.id.toLowerCase(), name: n.subtitle ? `${n.name}, ${n.subtitle}` : n.name, publicCode: n.publicCode, url: n.cardImage.url });
  }
  for (const v of Object.values(n)) walk(v); };
walk(nd);
log("gallery images", gallery.size);
const cards = JSON.parse(fs.readFileSync("data/public/cards.json", "utf8"));
const byExt = new Map(cards.filter((c) => c.externalId).map((c) => [c.externalId.toLowerCase(), c]));
const hive = JSON.parse(fs.readFileSync("probe-out/hive-shop.json", "utf8")).filter((d) => d.category === "Single");
const norm = (s) => String(s ?? "").replace(/\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const st = { singles: hive.length, noHash: 0, notInGallery: 0, noCard: 0, nameDiff: 0, setDiff: 0, ok: 0 };
const samples = { notInGallery: [], noCard: [], nameDiff: [], setDiff: [], ok: [] };
for (const d of hive) {
  const h = /game_data_live\/([0-9a-f]{40})/.exec(d.image ?? "")?.[1];
  if (!h) { st.noHash++; continue; }
  const g = gallery.get(h);
  if (!g) { st.notInGallery++; samples.notInGallery.push(`${d.set_id} ${d.collector_number} ${d.rarity} ${d.displayName ?? d.name}`); continue; }
  const c = byExt.get(g.id);
  if (!c) { st.noCard++; samples.noCard.push(`${g.id} ${g.publicCode} ${g.name} <- ${d.displayName ?? d.name}`); continue; }
  if (norm(c.name) !== norm(d.name)) { st.nameDiff++; samples.nameDiff.push(`${c.name} [${c.externalId}] vs hive ${d.name}`); continue; }
  if (d.set_id && d.set_id !== c.setCode) { st.setDiff++; samples.setDiff.push(`${c.setCode} ${c.collectorNumber} ${c.name} vs hive ${d.set_id} ${d.collector_number}`); continue; }
  st.ok++; samples.ok.push(`${c.externalId} ${c.collectorNumber} ${c.rarity} ${c.variant ?? ""} ${c.isOvernumbered ? "OVER" : ""} <- ${d.set_id} ${d.collector_number} ${d.rarity} ${d.displayName ?? d.name} £${d.price}`);
}
log(JSON.stringify(st));
for (const [k, v] of Object.entries(samples)) { log("==", k, v.length); for (const s of (k === "ok" ? v.filter((x) => /OVER| a | b |Showcase|Alternate/.test(x)) : v).slice(0, 60)) log("  ", s); }
fs.writeFileSync("probe-out/hive-match.txt", out.join("\n"));
