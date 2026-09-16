import { defineConfig } from "oxlint";
import base from "../../oxlint.config.mts";

/**
 * The root barrel re-exports every module of the `dms` interface. Reached from
 * a file a consumer can enter through a subpath, that creates an evaluation
 * cycle which crashes them at require time, so the guard stays an error even
 * while `import/no-cycle` is still only reporting.
 */
const ROOT_IMPORT =
  "The package root re-exports the whole interface; from a module a consumer can enter through a subpath this creates an evaluation cycle that crashes them. Import from the leaf module that defines the symbol.";

const BASE_BARREL =
  "The `base` barrel pulls in table-view, which imports interface files back; importing the barrel from another interface file creates an evaluation-order cycle for consumers entering through a subpath. Import the defining `base` submodule instead (e.g. base/layouts, base/table-view).";

const ROOT_PATHS = [
  { name: "../index", message: ROOT_IMPORT },
  { name: "../../index", message: ROOT_IMPORT },
  { name: "../../../index", message: ROOT_IMPORT },
  { name: "../../../../index", message: ROOT_IMPORT },
  { name: "@antelopejs/interface-dms", message: ROOT_IMPORT },
  { name: "@antelopejs/interface-dms/base", message: BASE_BARREL },
  { name: "../base", message: BASE_BARREL },
  { name: "../../base", message: BASE_BARREL },
  { name: "./base", message: BASE_BARREL },
];

/**
 * `paths` matches a specifier literally, so the directory form (`../..`) and a
 * `.js` suffix slip past it.
 */
const ROOT_PATTERNS = [
  { regex: String.raw`^\.\.(/\.\.)*(/index(\.js)?)?$`, message: ROOT_IMPORT },
  {
    regex: String.raw`^@antelopejs/interface-dms(/index(\.js)?)?$`,
    message: ROOT_IMPORT,
  },
];

export default defineConfig({
  ...base,
  options: {
    ...base.options,
    // Ceiling on the warning debt inherited from the runtime package, so CI
    // catches the new ones. It is meant to come down, not to be spent.
    maxWarnings: 8,
  },
  rules: {
    "eslint/no-restricted-imports": [
      "error",
      { paths: ROOT_PATHS, patterns: ROOT_PATTERNS },
    ],
  },
  overrides: [
    {
      files: ["src/index.ts"],
      rules: {
        // The barrel is the root; the guard exists to keep the leaves out of it.
        "eslint/no-restricted-imports": "off",
      },
    },
  ],
});
