import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { WORKSPACE_FOLDER } from "./build-key.mjs";

const COPY_SKIPPED = new Set(["node_modules", ".antelope", WORKSPACE_FOLDER]);
const SHADOW_SKIPPED = new Set([".antelope", WORKSPACE_FOLDER, ".git"]);

/**
 * @param {string} real
 * @param {string} shadow
 * @param {string} keep
 */
function shadowLevel(real, shadow, keep) {
  mkdirSync(shadow, { recursive: true });
  for (const entry of readdirSync(real)) {
    if (entry === keep || SHADOW_SKIPPED.has(entry)) continue;
    symlinkSync(join(real, entry), join(shadow, entry));
  }
}

/**
 * A `node_modules` that is `modules` with `@antelopejs/dms-frontend` replaced
 * by the renderer checkout, every other entry linked to the original.
 *
 * @param {string} modules The playground's installed modules
 * @param {string} shadow The run's `node_modules`
 * @param {string} renderer The renderer checkout
 */
export function linkRenderer(modules, shadow, renderer) {
  const scope = "@antelopejs";
  shadowLevel(modules, shadow, scope);
  const scoped = join(modules, scope);
  const shadowScope = join(shadow, scope);
  if (existsSync(scoped)) shadowLevel(scoped, shadowScope, "dms-frontend");
  else mkdirSync(shadowScope);
  symlinkSync(renderer, join(shadowScope, "dms-frontend"));
}

/**
 * Lays out the run's copy of the checkout: from the checkout root down to
 * the playground, every sibling is linked, so relative paths such as a
 * tsconfig `extends` resolve as in the checkout. The playground itself is
 * copied without its installed modules and build, so `.antelope/` and the
 * frontend build belong to the run. Its `node_modules` is the playground's,
 * except that `@antelopejs/dms-frontend` is the `renderer` checkout when
 * there is one.
 *
 * @param {string} playground The playground folder
 * @param {string} checkout The checkout root, or the module folder outside one
 * @param {string} root The run's copy of the checkout
 * @param {string} [renderer] The renderer checkout the run serves
 * @returns {string} The run's playground folder
 */
export function layOutCopy(playground, checkout, root, renderer) {
  const segments = relative(checkout, playground).split(sep);
  let real = checkout;
  let shadow = root;
  for (const segment of segments) {
    shadowLevel(real, shadow, segment);
    real = join(real, segment);
    shadow = join(shadow, segment);
  }
  cpSync(playground, shadow, {
    recursive: true,
    filter: (source) => !COPY_SKIPPED.has(basename(source)),
  });
  const modules = join(playground, "node_modules");
  if (renderer) linkRenderer(modules, join(shadow, "node_modules"), renderer);
  else symlinkSync(modules, join(shadow, "node_modules"));
  return shadow;
}
