import {
  ANTELOPE_IGNORE_PATTERNS,
  antelopePreset,
} from "@antelopejs/tooling-configs/oxc/lint";
import { defineConfig } from "oxlint";

/**
 * Reaching the runtime root from a leaf creates an evaluation cycle for
 * consumers entering through another interface subpath.
 */
const DMS_ROOT_IMPORT =
  "The package root re-imports the whole module graph; from any file reachable through an interface subpath this creates an evaluation cycle that crashes consumers. Import from the leaf module that defines the symbol (runtime config lives in src/config.ts).";

const DMS_ROOT_PATHS = [
  { name: "../index", message: DMS_ROOT_IMPORT },
  { name: "../../index", message: DMS_ROOT_IMPORT },
  { name: "../../../index", message: DMS_ROOT_IMPORT },
  { name: "../../../../index", message: DMS_ROOT_IMPORT },
  { name: "@antelopejs/dms", message: DMS_ROOT_IMPORT },
];

/** Literal paths alone miss directory imports and explicit .js suffixes. */
const DMS_ROOT_PATTERNS = [
  {
    regex: String.raw`^\.\.(/\.\.)*(/index(\.js)?)?$`,
    message: DMS_ROOT_IMPORT,
  },
  {
    regex: String.raw`^@antelopejs/dms(/index(\.js)?)?$`,
    message: DMS_ROOT_IMPORT,
  },
];

/** The interface root re-exports the module graph and creates the same cycle. */
const INTERFACE_ROOT_IMPORT =
  "The package root re-exports the whole interface; from a module a consumer can enter through a subpath this creates an evaluation cycle that crashes them. Import from the leaf module that defines the symbol.";

const BASE_BARREL =
  "The `base` barrel pulls in table-view, which imports interface files back; importing the barrel from another interface file creates an evaluation-order cycle for consumers entering through a subpath. Import the defining `base` submodule instead (e.g. base/layouts, base/table-view).";

const INTERFACE_ROOT_PATHS = [
  { name: "../index", message: INTERFACE_ROOT_IMPORT },
  { name: "../../index", message: INTERFACE_ROOT_IMPORT },
  { name: "../../../index", message: INTERFACE_ROOT_IMPORT },
  { name: "../../../../index", message: INTERFACE_ROOT_IMPORT },
  { name: "@antelopejs/interface-dms", message: INTERFACE_ROOT_IMPORT },
  { name: "@antelopejs/interface-dms/base", message: BASE_BARREL },
  { name: "../base", message: BASE_BARREL },
  { name: "../../base", message: BASE_BARREL },
  { name: "./base", message: BASE_BARREL },
];

const INTERFACE_ROOT_PATTERNS = [
  {
    regex: String.raw`^\.\.(/\.\.)*(/index(\.js)?)?$`,
    message: INTERFACE_ROOT_IMPORT,
  },
  {
    regex: String.raw`^@antelopejs/interface-dms(/index(\.js)?)?$`,
    message: INTERFACE_ROOT_IMPORT,
  },
];

/** A discarded promise must handle its own rejection before it reaches Node. */
const FLOATING_PROMISES = ["error", { ignoreVoid: false }] as const;

export default defineConfig({
  extends: [antelopePreset({ importSorting: false })],
  ignorePatterns: [
    ...ANTELOPE_IGNORE_PATTERNS,
    "packages/dms/frontend-vue/**",
    "packages/dms/playground/frontend-vue/app/plugins/app-widget-demo.ts",
    "packages/dms/playground/frontend-vue/app/plugins/command-palette-assistant-demo.client.ts",
    "packages/dms/playground/frontend-vue/app/plugins/command-palette-source-demo.client.ts",
    "packages/dms/playground/frontend-vue/app/plugins/dms-page-setup-demo.client.ts",
    "packages/dms/playground/frontend-vue/app/plugins/feature-palette-source.client.ts",
    "packages/dms/playground/frontend-vue/app/plugins/flag-display.ts",
    "packages/dms/playground/frontend-vue/app/plugins/header-action-demo.client.ts",
    "packages/dms/playground/frontend-vue/app/plugins/page-validation-demo.ts",
    "packages/dms/playground/frontend-vue/app/plugins/quick-action-ping.client.ts",
    "packages/dms/playground/frontend-vue/app/plugins/side-panel-demo.ts",
    "packages/dms/playground/frontend-vue/app/plugins/sidebar-widget-demo.ts",
    "packages/dms/playground/frontend-vue/app/plugins/sign-in-links-demo.ts",
    "packages/dms/playground/frontend-vue/app/plugins/table-view-cards-display.ts",
    "packages/dms/playground/frontend-vue/app/composables/usePageSetupLog.ts",
    "packages/dms/playground/frontend-vue/app/composables/usePlaygroundPaletteSource.ts",
    "packages/dms/playground/frontend-vue/app/composables/useSidePanelDemo.ts",
    "packages/dms/playground/frontend-vue/app/components/custom/BlockWiringPanel.vue",
    "packages/dms/playground/frontend-vue/app/components/custom/ModuleToolkit.vue",
    "packages/dms/playground/frontend-vue/app/components/custom/SlotFrame.vue",
    "packages/dms/playground/frontend-vue/app/components/chrome/PlaygroundOverlayBubble.vue",
  ],
  options: {
    typeAware: true,
  },
  rules: {
    "typescript/no-floating-promises": FLOATING_PROMISES,
  },
  overrides: [
    {
      files: ["packages/dms/**"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          { paths: DMS_ROOT_PATHS, patterns: DMS_ROOT_PATTERNS },
        ],
      },
    },
    {
      files: ["packages/interface-dms/**"],
      rules: {
        "eslint/no-restricted-imports": [
          "error",
          { paths: INTERFACE_ROOT_PATHS, patterns: INTERFACE_ROOT_PATTERNS },
        ],
      },
    },
    {
      files: ["packages/dms/playground/**"],
      rules: {
        "eslint/max-lines": "off",
      },
    },
    {
      files: [
        "packages/dms/src/test/unit/**",
        "packages/dms/src/test/integration/**",
      ],
      rules: {
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
        "anti-slop/no-chained-type-assertions": "off",
        "eslint/no-unused-expressions": "off",
        "eslint/no-restricted-imports": "off",
      },
    },
    {
      files: ["packages/interface-dms/src/index.ts"],
      rules: {
        "eslint/no-restricted-imports": "off",
      },
    },
  ],
});
