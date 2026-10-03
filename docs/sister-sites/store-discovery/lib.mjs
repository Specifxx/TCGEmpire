// Shared helpers for the store-discovery scripts. Node 20+, no dependencies.
// Politeness lives here so every script gets it: one identifying User-Agent, a
// per-host delay between requests, a timeout per request, backoff on 429/430/503,
// and robots.txt checked before any path on a host is fetched.
import fs from "node:fs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ────────────────────────────────────────────────────────────────────
// `--flag value` pairs plus positional args. Unknown flags are kept as strings.
export function parseArgs(argv = process.argv.slice(2)) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opts[a.slice(2)] = true;
      else { opts[a.slice(2)] = next; i++; }
    } else opts._.push(a);
  }
  return opts;
}

export function usage(text, opts) {
  if (opts.help || opts._.length < 2) { console.error(text.trim()); process.exit(opts.help ? 0 : 2); }
}

export function readJson(path) { return JSON.parse(fs.readFileSync(path, "utf8")); }
export function writeJson(path, data) { fs.writeFileSync(path, JSON.stringify(data, null, 1) + "\n"); }

// ── Game config ────────────────────────────────────────────────────────────
// Every key ending in "Re" is compiled into a case-insensitive RegExp; keys
// starting with "_" are comments and are left alone.
export function loadConfig(path) {
  const raw = readJson(path);
  const need = ["game", "handleRe", "titleRe", "conventionalHandles", "singlesHandleRe", "skipHandleRe", "cardNumberRe", "strictCardNumberRe",
    "foreignRe", "foreignOptionRe", "englishRe", "languageOptionRe", "gradedRe", "notSingleRe", "otherGamesRe",
    "minNumbered", "maxForeignShare", "maxHandlesPerStore", "maxCollectionsPerStore", "extraPagesWhenFull", "markets"];
  const missing = need.filter((k) => raw[k] === undefined);
  if (missing.length) throw new Error(`${path} is missing: ${missing.join(", ")} (see game.example.json)`);
  const cfg = { ...raw };
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_") && k.endsWith("Re") && typeof v === "string") cfg[k] = new RegExp(v, "i");
  return cfg;
}

// The market a store belongs to, from the country in its meta.json.
export function marketOf(cfg, isoCountry) {
  if (!isoCountry) return null;
  for (const [m, info] of Object.entries(cfg.markets)) if (info.countries.includes(isoCountry.toUpperCase())) return m;
  return null;
}

// ── HTTP ───────────────────────────────────────────────────────────────────
// Settings come from the CLI (--delay, --timeout, --ua) via setHttp().
const http = {
  delayMs: 300,
  timeoutMs: 20000,
  tries: 3,
  // Identify ourselves; stores and Shopify can see who is asking and why. Override
  // with --ua if a store family blocks non-browser agents, and say so in the notes.
  ua: "TCGEmpire-store-discovery/1.0 (+https://riftcompare.com)",
};
export function setHttp(opts) {
  if (opts.delay !== undefined) http.delayMs = Number(opts.delay);
  if (opts.timeout !== undefined) http.timeoutMs = Number(opts.timeout);
  if (typeof opts.ua === "string") http.ua = opts.ua;
  return { ...http };
}

export const stats = { requests: 0, blockedByRobots: 0 }; // printed in each script's last line
const lastHit = new Map(); // host -> timestamp of the last request we sent it
const hostDelay = new Map(); // host -> ms, raised by robots.txt Crawl-delay

async function waitTurn(host) {
  const gap = Math.max(http.delayMs, hostDelay.get(host) ?? 0);
  const wait = (lastHit.get(host) ?? 0) + gap - Date.now();
  lastHit.set(host, Date.now() + Math.max(0, wait));
  if (wait > 0) await sleep(wait);
}

// GET with timeout, retries and per-host spacing. Never throws.
// Returns { status, url (after redirects), body (text, only when 2xx), err }.
export async function get(url, { accept = "application/json, text/plain, */*" } = {}) {
  const host = new URL(url).host;
  let last = { status: 0, url, body: null, err: "not tried" };
  for (let k = 0; k < http.tries; k++) {
    await waitTurn(host);
    stats.requests++;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), http.timeoutMs);
    try {
      const r = await fetch(url, { headers: { "User-Agent": http.ua, Accept: accept }, signal: ac.signal, redirect: "follow" });
      const body = r.ok ? await r.text() : null;
      last = { status: r.status, url: r.url || url, body };
      // 430 is Shopify's "security rejection" rate limit; 503 is often the same thing.
      if (r.status === 429 || r.status === 430 || r.status === 503) { await sleep(3000 * (k + 1)); continue; }
      return last;
    } catch (e) {
      last = { status: 0, url, body: null, err: String(e?.cause?.code || e?.name || e) };
      await sleep(1000 * (k + 1));
    } finally {
      clearTimeout(t);
    }
  }
  return last;
}

export function json(text) { try { return text ? JSON.parse(text) : null; } catch { return null; } }

// ── robots.txt ─────────────────────────────────────────────────────────────
// RFC 9309: use the group naming our product token if there is one, else "*".
// Rules support "*" and a trailing "$"; the longest matching rule wins and Allow
// wins a tie. A missing robots.txt (4xx) allows everything; an unreachable one
// also fails open, matching OP Compare's importer (src/lib/scrape.ts), but is logged.
const robotsCache = new Map();

function parseRobots(text, token) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase(); const value = m[2].trim();
    if (field === "user-agent") {
      if (!lastWasAgent) { cur = { agents: [], rules: [], crawlDelay: null }; groups.push(cur); }
      cur.agents.push(value.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if ((field === "allow" || field === "disallow") && value) cur.rules.push({ allow: field === "allow", path: value });
    if (field === "crawl-delay" && Number(value) > 0) cur.crawlDelay = Number(value);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules), crawlDelay: Math.max(0, ...chosen.map((g) => g.crawlDelay ?? 0)) };
}

function ruleMatches(rule, path) {
  const anchored = rule.endsWith("$");
  const src = (anchored ? rule.slice(0, -1) : rule).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + src + (anchored ? "$" : "")).test(path);
}

// Returns a function (pathWithQuery) => boolean for this origin.
export async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const token = http.ua.split("/")[0].toLowerCase();
  const r = await get(`${origin}/robots.txt`, { accept: "text/plain, */*" });
  let check = () => true;
  if (r.body && !/^\s*</.test(r.body)) {
    const { rules, crawlDelay } = parseRobots(r.body, token);
    // Crawl-delay is honoured, capped at 10 s so one odd file cannot stall a batch.
    if (crawlDelay) hostDelay.set(new URL(origin).host, Math.min(10, crawlDelay) * 1000);
    check = (path) => {
      const hits = rules.filter((x) => ruleMatches(x.path, path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
      return hits.length === 0 || hits[0].allow;
    };
  } else if (r.status === 0 || r.status >= 500) {
    console.warn(`  robots.txt unreachable for ${origin} (${r.status || r.err}); proceeding (fail open)`);
  }
  robotsCache.set(origin, check);
  return check;
}

// GET a path on an origin only if robots.txt allows it. Returns null when blocked.
export async function politeGet(origin, pathAndQuery, opts) {
  const allowed = await robotsFor(origin);
  if (!allowed(pathAndQuery)) { stats.blockedByRobots++; return { status: -1, url: origin + pathAndQuery, body: null, err: "robots.txt disallows" }; }
  return get(origin + pathAndQuery, opts);
}

// ── Concurrency ────────────────────────────────────────────────────────────
// Run fn over items with N workers (stores in parallel; requests to ONE store
// stay sequential and spaced by the per-host delay).
export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  async function worker() { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

export const hostOf = (u) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();

// ── Listing classifier (shared by probe and verify) ────────────────────────
// One Shopify product -> what kind of listing it is, using only the config.
// deep=false looks at title, SKUs, option values and variant titles (cheap,
// what the probe uses); deep=true also reads tags, product_type and body text
// (the second-pass language check that caught sg-manapro.com on 2026-10-03).
export function classify(p, cfg, deep = false) {
  const variants = p.variants ?? [];
  const skus = variants.map((v) => v.sku ?? "").join(" ");
  const inTitle = cfg.cardNumberRe.test(p.title);
  const numbered = inTitle || cfg.cardNumberRe.test(skus);
  const vt = variants.map((v) => v.title ?? "").join(" | ");
  const langOpt = (p.options ?? []).find((o) => cfg.languageOptionRe.test((o.name ?? "").trim()));
  const optText = (p.options ?? []).map((o) => (o.values ?? []).join(" | ")).join(" | ");
  // A language option that offers English makes the product English-capable,
  // whatever else it offers; one that offers only foreign values makes it foreign.
  const langValues = langOpt?.values ?? [];
  const langEnglish = langValues.some((v) => cfg.englishRe.test(v));
  const langForeign = langValues.length > 0 && !langEnglish && langValues.some((v) => cfg.foreignOptionRe.test(v) || cfg.foreignRe.test(v));
  let foreign = cfg.foreignRe.test(p.title) || langForeign || (!langOpt && cfg.foreignOptionRe.test(`${optText} | ${vt}`));
  let foreignTag = false, foreignBody = false;
  if (deep) {
    const tags = `${(p.tags ?? []).join(" | ")} | ${p.product_type ?? ""}`;
    foreignTag = cfg.foreignOptionRe.test(tags) && !cfg.englishRe.test(tags);
    // Body text is only a flag: store-wide boilerplate ("we also stock Japanese
    // cards") would otherwise mark every product foreign.
    const body = (p.body_html ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    foreignBody = cfg.foreignOptionRe.test(body) && !cfg.englishRe.test(body);
    if (foreignTag && !langEnglish) foreign = true;
  }
  const english = cfg.englishRe.test(p.title) || langEnglish;
  const graded = cfg.gradedRe.test(p.title) || cfg.gradedRe.test(vt);
  const notSingle = cfg.notSingleRe.test(p.title) || /sealed|accessor/i.test(p.product_type ?? "");
  const otherGame = cfg.otherGamesRe.test(p.title) || (cfg.otherGamesRe.test(p.product_type ?? "") && !cfg.titleRe.test(`${p.title} ${p.product_type ?? ""}`));
  return {
    numbered, inTitle, strict: cfg.strictCardNumberRe.test(p.title) || cfg.strictCardNumberRe.test(skus),
    foreign, foreignTag, foreignBody, english, graded, notSingle, otherGame,
    clean: numbered && !foreign && !graded && !notSingle && !otherGame,
    available: variants.some((v) => v.available),
    languageOption: langOpt ? `${langOpt.name}: ${langValues.join("/")}` : null,
  };
}
