import { writeFileSync } from "node:fs";
import { layerAutoImportNames } from "./layer-auto-imports.mjs";

const LINE_WIDTH = 78;

/**
 * The names as lines of at most `LINE_WIDTH` characters, so the generated file
 * stays short however many names the layer auto-imports.
 * @param {string[]} names
 * @returns {string[]}
 */
function packed(names) {
  return names.reduce(
    /** @param {string[]} lines */
    (lines, name) => {
      const last = lines.at(-1);
      if (last !== undefined && last.length + name.length + 1 <= LINE_WIDTH) {
        lines[lines.length - 1] = `${last} ${name}`;
      } else {
        lines.push(name);
      }
      return lines;
    },
    [],
  );
}

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
    "const NAMES = `",
    ...packed(names),
    "`;",
    "",
    "export default Object.freeze(",
    "  Object.fromEntries(",
    "    NAMES.split(/\\s+/u)",
    "      .filter(Boolean)",
    '      .map((name) => [name, "readonly"]),',
    "  ),",
    ");",
    "",
  ].join("\n"),
);
