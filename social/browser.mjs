// Chromium for the renderers: `playwright` where it is installed with its own
// browser (the cloud sandbox), else `playwright-core` driving CHROMIUM_PATH (in
// Actions, the runner's Google Chrome). Neither is a project dependency.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export async function launch() {
  const args = ["--allow-file-access-from-files", "--font-render-hinting=none"];
  if (!process.env.CHROMIUM_PATH) {
    try {
      return await require("playwright").chromium.launch({ args });
    } catch {
      // fall through to playwright-core
    }
  }
  const { chromium } = require("playwright-core");
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args });
}
