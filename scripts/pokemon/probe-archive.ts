// One look at TCGCSV's daily price archive, to decide whether a year of
// TCGplayer market-price history can be backfilled for the Pokémon section
// (Phase 2). Run by .github/workflows/pokemon-archive-probe.yml, by hand only:
//
//   PROBE_DATE=2026-09-30 npx tsx scripts/pokemon/probe-archive.ts
//
// It downloads ONE archive, extracts it with 7-Zip and prints what is inside:
// the top-level tree, the Pokémon (category 3) paths and the first 2 KB of one
// set's price file. No database, no secrets, nothing written outside a temp
// directory. Every URL it tries is logged with its HTTP status, and it always
// ends with one "VERDICT:" line and exit 0, because "blocked" or "not there" is
// itself the answer the probe exists to get. The one non-zero exit is a date
// that is not YYYY-MM-DD: the workflow passes its input through env, and this
// is the check that keeps it from ever reaching a URL or a command line.
//
// The URL and layout are TCGCSV's FAQ (https://tcgcsv.com/faq, read 2026-10-01):
// prices-{date}.ppmd.7z, extracting to {date}/{categoryId}/{groupId}/prices,
// from 2024-02-08 on. Unverified from the sandbox this was written in (HTTP 403),
// and the archive's terms of use are not stated there either.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const POKEMON_CATEGORY = "3";
const FIRST_ARCHIVE_DAY = "2024-02-08";
const USER_AGENT = "RiftCompare archive probe (+https://riftcompare.com/contact)";

function probeDate(): string {
  const raw = (process.env.PROBE_DATE ?? "").trim();
  if (!raw) {
    // No date given: yesterday (UTC), the newest archive that should exist.
    return new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) || new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw) {
    console.error(`PROBE_DATE must be a real date written YYYY-MM-DD; got ${JSON.stringify(raw.slice(0, 40))}.`);
    process.exit(1);
  }
  return raw;
}

function verdict(text: string): void {
  console.log(`\nVERDICT: ${text}`);
}

async function fetchStatus(url: string, method: "HEAD" | "GET"): Promise<Response | null> {
  try {
    const res = await fetch(url, { method, headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(120_000) });
    console.log(`${method} ${url} → HTTP ${res.status} ${res.headers.get("content-type") ?? ""} ${res.headers.get("content-length") ?? ""}`.trim());
    return res;
  } catch (e) {
    console.log(`${method} ${url} → failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

async function main() {
  const date = probeDate();
  console.log(`Probing TCGCSV's price archive for ${date}${date < FIRST_ARCHIVE_DAY ? ` (before ${FIRST_ARCHIVE_DAY}, the first day the FAQ says exists)` : ""}.`);

  // The site itself and the FAQ first, so a block on the whole host reads
  // differently from a missing archive.
  await fetchStatus("https://tcgcsv.com/", "HEAD");
  await fetchStatus("https://tcgcsv.com/faq", "HEAD");

  const candidates = [`https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`];
  let archive: { url: string; body: Buffer } | null = null;
  for (const url of candidates) {
    const res = await fetchStatus(url, "GET");
    if (res?.ok) {
      archive = { url, body: Buffer.from(await res.arrayBuffer()) };
      console.log(`Downloaded ${archive.body.length.toLocaleString("en-US")} bytes from ${url}`);
      break;
    }
  }
  if (!archive) {
    verdict(`no archive downloaded for ${date}; see the HTTP statuses above (403 = blocked, 404 = no archive for that day).`);
    return;
  }

  const work = mkdtempSync(join(tmpdir(), "pokemon-archive-"));
  try {
    const file = join(work, `prices-${date}.ppmd.7z`);
    writeFileSync(file, archive.body);
    try {
      // execFile, not a shell: nothing here is ever parsed as a command line.
      const out = execFileSync("7z", ["x", "-y", `-o${join(work, "x")}`, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      console.log(out.split("\n").filter((l) => /^(Everything is Ok|Files|Folders|Size|Compressed|ERROR)/.test(l)).join("\n"));
    } catch (e) {
      verdict(`downloaded but 7-Zip could not extract it: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      return;
    }

    const root = join(work, "x");
    const top = list(root);
    console.log(`\nTop level (${top.length}): ${top.slice(0, 20).join(", ")}${top.length > 20 ? ", …" : ""}`);
    const dayDir = existsSync(join(root, date)) ? join(root, date) : root;
    const categories = list(dayDir);
    console.log(`Categories under ${dayDir === root ? "the root" : date} (${categories.length}): ${categories.slice(0, 30).join(", ")}${categories.length > 30 ? ", …" : ""}`);

    const pokemon = join(dayDir, POKEMON_CATEGORY);
    const groups = list(pokemon).filter((g) => statSync(join(pokemon, g)).isDirectory());
    if (!groups.length) {
      verdict(`archive extracted, but there is no category ${POKEMON_CATEGORY} (Pokémon) folder where the FAQ puts it; layout differs, see the tree above.`);
      return;
    }
    console.log(`\nCategory ${POKEMON_CATEGORY} groups (${groups.length}): ${groups.slice(0, 40).join(", ")}${groups.length > 40 ? ", …" : ""}`);
    for (const g of groups.slice(0, 5)) console.log(`  ${date}/${POKEMON_CATEGORY}/${g}: ${list(join(pokemon, g)).join(", ")}`);

    const sample = groups.map((g) => join(pokemon, g, "prices")).find((p) => existsSync(p));
    if (!sample) {
      verdict(`category ${POKEMON_CATEGORY} has ${groups.length} groups but no "prices" file in any of them; see the paths above.`);
      return;
    }
    const text = readFileSync(sample, "utf8");
    console.log(`\nFirst 2 KB of ${sample.slice(root.length + 1)} (${text.length.toLocaleString("en-US")} bytes):\n${text.slice(0, 2048)}`);

    let shape = "not JSON";
    try {
      const parsed = JSON.parse(text) as { results?: Record<string, unknown>[] };
      const first = parsed.results?.[0];
      shape = first ? `JSON, results[] of ${parsed.results?.length} rows with keys ${Object.keys(first).join(", ")}` : "JSON without a results array";
    } catch {
      /* reported as "not JSON" */
    }
    verdict(`archive for ${date} downloaded and extracted: ${groups.length} Pokémon groups; price file is ${shape}.`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  verdict(`probe crashed: ${e instanceof Error ? e.message : String(e)}`);
});
