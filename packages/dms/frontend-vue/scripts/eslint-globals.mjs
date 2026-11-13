import { writeFileSync } from "node:fs";
import { layerAutoImportNames } from "./layer-auto-imports.mjs";

const names = await layerAutoImportNames();

writeFileSync(
  new URL("../eslint-globals.generated.mjs", import.meta.url),
  [
    "/**",
    " * ESLint flat-config globals for every name the DMS layer auto-imports",
    " * from the directories its `dms.frontend.build.ts` declares. Combine with",
    " * `@antelopejs/dms-frontend/eslint-globals`. Written by",
    " * `pnpm eslint-globals`.",
    " */",
    "export default Object.freeze({",
    ...names.map((name) => `  ${name}: "readonly",`),
    "});",
    "",
  ].join("\n"),
);
