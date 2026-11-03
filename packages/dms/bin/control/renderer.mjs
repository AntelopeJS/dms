import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stringField } from "./json.mjs";

/** The package a renderer checkout must be. */
export const RENDERER_PACKAGE = "@antelopejs/dms-frontend";

/** The built CLI of a renderer checkout, relative to it. */
export const RENDERER_CLI = join("dist", "index.js");

/**
 * The renderer checkout a run serves: an absolute folder holding the
 * `@antelopejs/dms-frontend` package with its build.
 *
 * @param {string} folder The `--renderer` folder
 * @returns {string} Its absolute path
 * @throws When the folder is not that package, or is not built
 */
export function resolveRenderer(folder) {
  const root = resolve(folder);
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) {
    throw new Error(`--renderer ${root} has no package.json`);
  }
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(manifest, "utf8"));
  const name = stringField(parsed, "name");
  if (name !== RENDERER_PACKAGE) {
    throw new Error(
      `--renderer ${root} is ${name ?? "unnamed"}, not ${RENDERER_PACKAGE}`,
    );
  }
  if (!existsSync(join(root, RENDERER_CLI))) {
    throw new Error(
      `--renderer ${root} has no ${RENDERER_CLI}: build it first (pnpm install, pnpm build)`,
    );
  }
  return root;
}
