// One-off: pull the most recent user-pasted PNG out of the conversation transcript
// (images are embedded as base64 there) so we can process the logo.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const JSONL = "C:\\Users\\billj\\.claude\\projects\\C--Users-billj-OneDrive-Desktop-TCGEmpire\\07c7c892-1d0b-4313-9936-710d53f04b8b.jsonl";
const lines = readFileSync(JSONL, "utf8").split("\n").filter(Boolean);

function findImages(obj: any, out: { media: string; data: string }[]) {
  if (!obj || typeof obj !== "object") return;
  if (obj.type === "image" && obj.source?.type === "base64" && obj.source?.data) {
    out.push({ media: obj.source.media_type, data: obj.source.data });
  }
  for (const k of Object.keys(obj)) findImages((obj as any)[k], out);
}

let found: { media: string; data: string } | null = null;
let lineIdx = -1;
for (let i = lines.length - 1; i >= 0 && !found; i--) {
  let o: any;
  try { o = JSON.parse(lines[i]); } catch { continue; }
  const role = o.message?.role ?? o.role ?? o.type;
  if (role !== "user") continue;
  const imgs: { media: string; data: string }[] = [];
  findImages(o, imgs);
  const png = imgs.find((im) => im.media === "image/png");
  if (png) { found = png; lineIdx = i; }
}
if (!found) { console.error("No user-pasted PNG found in transcript."); process.exit(1); }
const buf = Buffer.from(found.data, "base64");
mkdirSync("public", { recursive: true });
writeFileSync("public/rc-source.png", buf);
console.log(`Found PNG at line ${lineIdx}, ${buf.length} bytes → public/rc-source.png`);
