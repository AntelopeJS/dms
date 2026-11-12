import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  type Browser,
  type Chromium,
  PlaywrightModuleSchema,
} from "./playwright";

const execFileAsync = promisify(execFile);

const PLAYWRIGHT_PACKAGE = "playwright-core";
const INSTALL_ARGS = ["install", "chromium-headless-shell"];
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const INSTALL_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const MISSING_EXECUTABLE = "Executable doesn't exist";
const OUTPUT_TAIL_CHARS = 2_000;

async function loadChromium(): Promise<Chromium> {
  const loaded = PlaywrightModuleSchema.safeParse(
    await import(PLAYWRIGHT_PACKAGE).catch(() => undefined),
  );
  if (!loaded.success) {
    throw new Error(
      `page_verify drives Chromium through ${PLAYWRIGHT_PACKAGE}, an optional dependency of @antelopejs/dms that this install left out. Install the dependencies without --no-optional, then call page_verify again.`,
    );
  }
  return loaded.data.chromium;
}

function cliPath(): string {
  return path.join(
    path.dirname(require.resolve(`${PLAYWRIGHT_PACKAGE}/package.json`)),
    "cli.js",
  );
}

async function installChromium(): Promise<void> {
  Logging.Info(
    "[DMS] page_verify: installing the headless Chromium Playwright pins (first use only, about 330 MB in Playwright's browser cache)…",
  );
  try {
    await execFileAsync(process.execPath, [cliPath(), ...INSTALL_ARGS], {
      timeout: INSTALL_TIMEOUT_MS,
      maxBuffer: INSTALL_MAX_BUFFER_BYTES,
    });
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Installing Chromium for page_verify failed: ${output.slice(-OUTPUT_TAIL_CHARS)}`,
    );
  }
  Logging.Info("[DMS] page_verify: Chromium is installed.");
}

/**
 * Launches the headless Chromium the installed Playwright pins, downloading
 * it first when this machine has none: the browser lives in Playwright's own
 * cache, never in the project or a production install.
 */
export async function launchBrowser(): Promise<Browser> {
  const chromium = await loadChromium();
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (
      !(error instanceof Error && error.message.includes(MISSING_EXECUTABLE))
    ) {
      throw error;
    }
  }
  await installChromium();
  return chromium.launch({ headless: true });
}
