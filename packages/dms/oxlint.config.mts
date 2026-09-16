import { defineConfig } from "oxlint";
import base from "../../oxlint.config.mts";

/**
 * The package root re-imports the whole module graph. Reaching it from a leaf
 * creates an evaluation cycle that crashes a consumer entering through another
 * entry point, so the guard stays an error even while `import/no-cycle` is
 * still only reporting.
 */
const ROOT_IMPORT =
  "The package root re-imports the whole module graph; from any file reachable through an interface subpath this creates an evaluation cycle that crashes consumers. Import from the leaf module that defines the symbol (runtime config lives in src/config.ts).";

const ROOT_PATHS = [
  { name: "../index", message: ROOT_IMPORT },
  { name: "../../index", message: ROOT_IMPORT },
  { name: "../../../index", message: ROOT_IMPORT },
  { name: "../../../../index", message: ROOT_IMPORT },
  { name: "@antelopejs/dms", message: ROOT_IMPORT },
];

/**
 * `paths` matches a specifier literally, so the directory form (`../..`) and a
 * `.js` suffix slip past it. `require()` stays out of reach -- the rule only
 * sees import and export statements -- but no source file uses it.
 */
const ROOT_PATTERNS = [
  { regex: String.raw`^\.\.(/\.\.)*(/index(\.js)?)?$`, message: ROOT_IMPORT },
  {
    regex: String.raw`^@antelopejs/dms(/index(\.js)?)?$`,
    message: ROOT_IMPORT,
  },
];

export default defineConfig({
  ...base,
  ignorePatterns: [
    ...(base.ignorePatterns ?? []),
    // The module's layer has its own ESLint setup, which owns it until the front
    // end migrates. The playground's layer has none, so it stays here.
    "frontend-vue/**",
  ],
  options: {
    ...base.options,
    // Ceiling on the warning debt, so CI catches the new ones. Here rather
    // than in the lint script, so `lint:fix` and any direct oxlint run share
    // the same budget.
    //
    // What is left is file length, deliberately: splitting that file is a
    // decision about module boundaries, not a fix. The interface package
    // carries its own ceiling for the modules that moved there.
    maxWarnings: 1,
  },
  rules: {
    "eslint/no-restricted-imports": [
      "error",
      { paths: ROOT_PATHS, patterns: ROOT_PATTERNS },
    ],
  },
  overrides: [
    {
      files: ["playground/**"],
      rules: {
        // The playground exists to show every option of every component, so its
        // files are long by design; splitting them would only scatter the examples.
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
      },
    },
    {
      files: ["src/test/unit/**", "src/test/integration/**"],
      rules: {
        // A `describe` block is not a function anyone splits, and an integration
        // suite's length is its coverage. These ceilings are about code someone has
        // to hold in their head at once, which is not what a test file asks of a
        // reader.
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
        // The doubles implement only what the case under them calls, so the
        // source and the target never overlap and a single assertion is not
        // expressible. Building full instances instead would test the fixture.
        "anti-slop/no-chained-type-assertions": "off",
        // `expect(x).to.be.true` is chai's assertion form, not a stray expression.
        "eslint/no-unused-expressions": "off",
        // Tests reach into the package root on purpose: they assert on what a
        // consumer entering there actually gets.
        "eslint/no-restricted-imports": "off",
      },
    },
  ],
});
