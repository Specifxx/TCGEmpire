// Chromium for the renderers. Uses `playwright` (installed in CI and in the cloud
// sandbox), else `playwright-core` with CHROMIUM_PATH. Not a project dependency.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export async function launch() {
  const args = ["--allow-file-access-from-files", "--font-render-hinting=none"];
  try {
    return await require("playwright").chromium.launch({ args });
  } catch {
    const { chromium } = require("playwright-core");
    return chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args });
  }
}
