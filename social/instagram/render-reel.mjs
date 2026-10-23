// Render a reel: social/instagram/reels/<name>/index.html → frames → MP4 (H.264 + AAC).
//   node social/instagram/render-reel.mjs social/instagram/reels/<name> [fps]
// The page declares window.REEL = { width, height, duration } (1080x1920 for a
// reel, 1080x1080 for a square feed video) and uses CSS or
// Web Animations only. Each frame pauses every animation and seeks it to the
// frame's time, so the output is exact and repeatable, never a screen
// recording. If the folder has soundtrack.wav it is muxed in.
// Needs playwright-core (`npm i --no-save playwright-core`), Chromium and ffmpeg.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.resolve(process.argv[2] ?? ".");
const fps = Number(process.argv[3] ?? 30);
const frames = path.join(dir, ".frames");
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(dir, "index.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const { duration, width = 1080, height = 1920 } = await page.evaluate(() => window.REEL);
await page.setViewportSize({ width, height });
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));

const total = Math.round(duration * fps);
for (let i = 0; i < total; i++) {
  const ms = (i / fps) * 1000;
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) a.currentTime = t;
    window.onReelFrame?.(t);
  }, ms);
  await page.screenshot({ path: path.join(frames, `${String(i).padStart(5, "0")}.png`), type: "png" });
  if (i % 60 === 0) console.log(`frame ${i}/${total}`);
}
await browser.close();

const out = path.join(dir, "reel.mp4");
const audio = path.join(dir, "soundtrack.wav");
const args = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frames, "%05d.png")];
if (fs.existsSync(audio)) args.push("-i", audio);
args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", "-r", String(fps));
if (fs.existsSync(audio)) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
args.push(out);
execFileSync("ffmpeg", args, { stdio: "inherit" });
fs.rmSync(frames, { recursive: true, force: true });
console.log(out);
