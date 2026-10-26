// Film a pack's video.html frame by frame → video.mp4 (H.264 + AAC) + cover.jpg.
//   node social/render-reel.mjs social/out/<pack> [fps]
// The page declares window.REEL = { width, height, duration, cover } and moves
// only through CSS animations; each frame pauses every animation and seeks it to
// the frame's time, so the output is exact and repeatable, never a screen
// recording. soundtrack.wav in the folder is muxed in (social/soundtrack.py).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./browser.mjs";

const dir = path.resolve(process.argv[2] ?? ".");
const fps = Number(process.argv[3] ?? 30);
const frames = path.join(dir, ".frames");
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(dir, "video.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => Promise.all([document.fonts.ready, window.READY]));
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src.slice(0, 80)));
if (broken.length) throw new Error(`images failed to load: ${broken.join(", ")}`);
const { duration, width = 1080, height = 1920, cover } = await page.evaluate(() => window.REEL);
await page.setViewportSize({ width, height });
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));

const seek = (ms) => page.evaluate((t) => {
  for (const a of document.getAnimations()) a.currentTime = t;
  window.onReelFrame?.(t);
}, ms);
const total = Math.round(duration * fps);
for (let i = 0; i < total; i++) {
  await seek((i / fps) * 1000);
  await page.screenshot({ path: path.join(frames, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95 });
  if (i % 150 === 0) console.log(`frame ${i}/${total}`);
}
if (cover != null) {
  await seek(cover * 1000);
  await page.screenshot({ path: path.join(dir, "cover.jpg"), type: "jpeg", quality: 92 });
}
await browser.close();

const out = path.join(dir, "video.mp4");
const audio = path.join(dir, "soundtrack.wav");
const args = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frames, "%05d.jpg")];
if (fs.existsSync(audio)) args.push("-i", audio);
args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", "-r", String(fps));
if (fs.existsSync(audio)) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
args.push(out);
execFileSync("ffmpeg", args, { stdio: "inherit" });
fs.rmSync(frames, { recursive: true, force: true });
console.log(out);
