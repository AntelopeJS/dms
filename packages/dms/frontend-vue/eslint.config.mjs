import rendererGlobals from "@antelopejs/dms-frontend/eslint-globals";
import { antelopeNuxtConfig } from "@antelopejs/tooling-configs/eslint";
import globals from "globals";
import dmsGlobals from "./eslint-globals.generated.mjs";

export default antelopeNuxtConfig().append({
  files: ["**/*.{js,mjs,cjs,ts,vue}"],
  languageOptions: {
    parserOptions: { lib: ["esnext", "dom", "dom.iterable"] },
    globals: {
      ...globals.browser,
      ...globals.node,
      ...rendererGlobals,
      ...dmsGlobals,
    },
  },
  rules: {
    "no-undef": "error",
    "vue/attributes-order": "error",
  },
});
