import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";
import { defineConfig } from "oxlint";

/**
 * What both packages lint the same way. Each one adds its own ignore patterns,
 * its own restricted-import guards and its own warning ceiling on top, since
 * those describe that package's module graph and its own debt.
 */
export default defineConfig({
  extends: [
    antelopePreset({
      // Reordering every import file-wide would bury a change under mechanical
      // churn. Turned on with the formatting pass, which also brings the plugin.
      importSorting: false,
    }),
  ],
  ignorePatterns: [...ANTELOPE_IGNORE_PATTERNS],
  options: {
    typeAware: true,
  },
  rules: {
    // `void` only silences the rule: a rejection it lets through is
    // unhandled, and the runtime exits the process on one. A promise fired
    // without awaiting it handles its own failure (`.catch`, try/catch).
    "typescript/no-floating-promises": ["error", { ignoreVoid: false }],
  },
});
