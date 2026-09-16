// Runs after `@capacitor/assets generate` (see package.json → "assets").
//
// That tool writes www/manifest.json with every icon entry typed
// "image/png" while emitting the files as .webp. A browser that trusts the
// declared type over sniffing rejects the icon, and — more to the point — the
// mismatch is regenerated every single time anyone runs `npm run assets`, so
// fixing the file by hand does not stay fixed. Hence a post-step.
//
// It also restores the identity fields the generator drops, so the bundled
// shell keeps a name and a theme colour.
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../www/manifest.json", import.meta.url);
const manifest = JSON.parse(readFileSync(PATH, "utf8"));

for (const icon of manifest.icons ?? []) {
  icon.type = icon.src.endsWith(".webp") ? "image/webp" : "image/png";
}

const fixed = {
  name: "RiftCompare",
  short_name: "RiftCompare",
  display: "standalone",
  theme_color: "#0a0f1a",
  ...manifest,
};

writeFileSync(PATH, `${JSON.stringify(fixed, null, 2)}\n`);
console.log(`fix-manifest-mime: ${fixed.icons?.length ?? 0} icon types corrected`);
