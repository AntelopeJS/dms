import { Logging } from "@antelopejs/interface-core/logging";
import {
  type Browser,
  type Chromium,
  CoreBundleSchema,
  PlaywrightModuleSchema,
} from "./playwright";

const PLAYWRIGHT_PACKAGE = "playwright-core";
const HEADLESS_SHELL = "chromium-headless-shell";
const MISSING_EXECUTABLE = "Executable doesn't exist";
const MISSING_PLAYWRIGHT = `page_verify drives Chromium through ${PLAYWRIGHT_PACKAGE}, an optional dependency of @antelopejs/dms that this install left out. Install the dependencies without --no-optional, then call page_verify again.`;

/**
 * Playwright's module, parsed. It is required by name, never imported:
 * its declarations do not compile under the TypeScript the DMS builds with.
 */
function requirePlaywright(): ReturnType<
  typeof PlaywrightModuleSchema.safeParse
> {
  try {
    return PlaywrightModuleSchema.safeParse(require("playwright-core"));
  } catch {
    return PlaywrightModuleSchema.safeParse(undefined);
  }
}

/**
 * Playwright's browser installer, the one its own `install` command runs. It
 * is the `registry` of the core bundle, the one internal entry the package
 * exports.
 */
function requireInstaller(): ReturnType<typeof CoreBundleSchema.safeParse> {
  try {
    return CoreBundleSchema.safeParse(
      require("playwright-core/lib/coreBundle"),
    );
  } catch {
    return CoreBundleSchema.safeParse(undefined);
  }
}

function loadChromium(): Chromium {
  const loaded = requirePlaywright();
  if (!loaded.success) throw new Error(MISSING_PLAYWRIGHT);
  return loaded.data.chromium;
}

async function installChromium(): Promise<void> {
  const installer = requireInstaller();
  if (!installer.success) throw new Error(MISSING_PLAYWRIGHT);
  Logging.Info(
    "[DMS] page_verify: installing the headless Chromium Playwright pins (first use only, about 330 MB in Playwright's browser cache)…",
  );
  const installed = await installer.data.installBrowsersForNpmInstall([
    HEADLESS_SHELL,
  ]);
  if (installed === false) {
    throw new Error(
      "page_verify needs Chromium, and PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD forbids downloading it. Unset it, or install it with `npx playwright-core install chromium-headless-shell`.",
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
  const chromium = loadChromium();
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
