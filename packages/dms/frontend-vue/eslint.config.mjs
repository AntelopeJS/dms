// oxlint-disable-next-line antelopejs/no-comments -- @ts-check enables TypeScript checking of this JavaScript config.
// @ts-check
import { TEST_FILE_GLOBS } from "@antelopejs/tooling-configs/oxc/guardrails";
import eslint from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import vue from "eslint-plugin-vue";
import globals from "globals";
import testQuality from "./eslint-test-quality.mjs";

const sourceFiles = ["**/*.{js,mjs,cjs,ts,vue}"];

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: { parser: typescriptParser },
  },
  {
    files: sourceFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        parser: typescriptParser,
        sourceType: "module",
      },
    },
    plugins: { "@typescript-eslint": typescript },
    rules: {
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "vue/attributes-order": "off",
      "vue/html-indent": "off",
      "vue/html-self-closing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/multi-word-component-names": "off",
      "vue/require-default-prop": "off",
      "vue/singleline-html-element-content-newline": "off",
    },
  },
  {
    files: TEST_FILE_GLOBS,
    plugins: { antelopejs: testQuality, "anti-slop": testQuality },
    rules: {
      "antelopejs/no-fs-read-in-tests": "error",
      "antelopejs/require-assertion": "error",
      "antelopejs/no-constant-value-assertion": "error",
      "antelopejs/no-typeof-function-only-test": "error",
      "anti-slop/no-module-mocking": "error",
    },
  },
];
