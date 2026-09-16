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
});
