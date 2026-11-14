import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The development dependencies the check resolves, with the range each is
 * installed at. `typescript` and `vue` parse the layer's files; the renderer
 * only lists the components it registers itself, such as `DmsLink`.
 */
const DMS_COMPONENTS_DEPENDENCIES = Object.freeze({
  typescript: ">=5.8.0 <7.0.0",
  vue: "^3.5.0",
  "@antelopejs/dms-frontend": ">=0.11.0 <0.12.0",
});

export const RENDERER = "@antelopejs/dms-frontend";

/** How the package manager running the check adds a development dependency. */
const ADD_DEV_DEPENDENCY = {
  pnpm: "pnpm add -D",
  npm: "npm install -D",
  yarn: "yarn add -D",
  bun: "bun add -d",
};

/** The command that adds `packages` at their range, for the package manager running the check. */
export function addCommand(packages) {
  const manager = (process.env.npm_config_user_agent ?? "").split("/")[0];
  const add = ADD_DEV_DEPENDENCY[manager] ?? ADD_DEV_DEPENDENCY.pnpm;
  const specs = packages.map(
    (name) => `"${name}@${DMS_COMPONENTS_DEPENDENCIES[name]}"`,
  );
  return `${add} ${specs.join(" ")}`;
}

function resolveFirst(requires, specifier) {
  for (const require of requires) {
    try {
      return require.resolve(specifier);
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Resolves `typescript` and `vue` from the layer, then from the installed
 * `@antelopejs/dms`, and the renderer from the layer alone.
 */
export function dependencies(layer) {
  const manifest = join(layer, "package.json");
  if (!existsSync(manifest)) throw new Error(`No package.json in ${layer}`);
  const fromLayer = createRequire(manifest);
  const parsers = [fromLayer, createRequire(import.meta.url)];
  const typescript = resolveFirst(parsers, "typescript");
  const sfc = resolveFirst(parsers, "vue/compiler-sfc");
  const missing = [
    ...(typescript ? [] : ["typescript"]),
    ...(sfc ? [] : ["vue"]),
  ];
  if (missing.length)
    throw new Error(
      `The DMS component check parses the layer with typescript and vue, and ${missing.join(" and ")} cannot be resolved from ${layer}. In ${layer}, run: ${addCommand(missing)}`,
    );
  const require = createRequire(import.meta.url);
  return {
    ts: require(typescript),
    parse: require(sfc).parse,
    rendererGlobals: resolveFirst([fromLayer], `${RENDERER}/eslint-globals`),
  };
}

/** The `Dms` components the `@antelopejs/dms-frontend` renderer registers itself, or none when it is not installed. */
export async function rendererComponentNames(globalsPath) {
  if (!globalsPath) return [];
  const { default: globals } = await import(pathToFileURL(globalsPath).href);
  return Object.keys(globals).filter((name) => /^Dms[A-Z]/.test(name));
}
