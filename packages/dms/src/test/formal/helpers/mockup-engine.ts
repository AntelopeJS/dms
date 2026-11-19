import fs from "node:fs";
import path from "node:path";
import {
  defaultMockupsDir,
  endMockupEngine,
  startMockupEngine,
} from "../../../mockup";

/** What a suite that runs the mockup engine can do about the mockups the tools write. */
export interface MockupEngine {
  /** Removes every mockup written since the suite began, and `mockups/` itself when it did not exist then. */
  clear(): void;
}

/**
 * Runs the mockup engine for a suite, as the project runs in development, so the mockup tools work
 * instead of refusing. The tools write under `mockups/` of the working directory, so the suite
 * puts it back as it found it.
 */
export function useMockupEngine(): MockupEngine {
  const found = new Set<string>();
  let existed = false;

  function clear(): void {
    const folder = defaultMockupsDir();
    if (!fs.existsSync(folder)) return;
    for (const name of fs.readdirSync(folder)) {
      if (!found.has(name)) {
        fs.rmSync(path.join(folder, name), { recursive: true, force: true });
      }
    }
    if (!existed && fs.readdirSync(folder).length === 0) fs.rmdirSync(folder);
  }

  before(() => {
    const folder = defaultMockupsDir();
    existed = fs.existsSync(folder);
    if (existed) for (const name of fs.readdirSync(folder)) found.add(name);
    startMockupEngine();
  });
  after(() => {
    endMockupEngine();
    clear();
  });
  return { clear };
}
