const { realpathSync } = require("node:fs");
const { isBuiltin } = require("node:module");
const nodePath = require("node:path");
const { sep } = nodePath;
const ts = require("typescript");
const {
  repository,
  options,
  cache,
  server,
  client,
  layers,
  skippedDirectories,
  codeExtensions,
} = require("./aliases-context.cjs");

const rankRules = require("../../../../.dependency-cruiser/playground.cjs")
  .forbidden.filter((rule) => rule.name.endsWith("-no-upward"))
  .map((rule) => ({
    from: new RegExp(rule.from.path),
    to: new RegExp(rule.to.path),
  }));
const loaderLibraries = new Set([
  "module",
  "vm",
  "worker_threads",
  "child_process",
  "process",
]);
const nonExecutableKinds = new Map([
  [".json", "json"],
  ["?raw", "vite"],
  ["?url", "vite"],
]);

/**
 * @param {string} path
 * @param {string} area
 * @returns {boolean}
 */
function inside(path, area) {
  const suffix = nodePath.relative(area, path);
  return (
    suffix !== ".." &&
    !suffix.startsWith(`..${sep}`) &&
    !nodePath.isAbsolute(suffix)
  );
}

/**
 * @param {string} specifier
 * @param {string} importer
 * @returns {string | undefined}
 */
function fallbackTarget(specifier, importer) {
  if (specifier.startsWith(".") || nodePath.isAbsolute(specifier)) {
    const target = nodePath.resolve(nodePath.dirname(importer), specifier);
    return ts.sys.fileExists(target) ? target : undefined;
  }
  for (const [pattern, targets] of Object.entries(options.paths)) {
    const [prefix, suffix = ""] = pattern.split("*");
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const match = specifier.slice(
      prefix.length,
      specifier.length - suffix.length,
    );
    for (const target of targets) {
      const path = nodePath.resolve(
        options.baseUrl,
        target.replace("*", match),
      );
      if (ts.sys.fileExists(path)) return path;
    }
  }
  return undefined;
}

/**
 * @param {string} importer
 * @param {string} target
 * @param {string | undefined} query
 * @param {boolean} viteAssets
 * @returns {boolean}
 */
function permittedEdge(importer, target, query, viteAssets) {
  if ([server, client, ...layers].some((area) => inside(target, area))) {
    const extension = nodePath.extname(target);
    const inert = nonExecutableKinds.get(query ?? extension);
    if (
      target.split(sep).some((part) => skippedDirectories.has(part)) ||
      extension === "" ||
      !(
        (query === undefined && codeExtensions.has(extension)) ||
        inert === "json" ||
        (inert === "vite" && inside(importer, client) && viteAssets)
      )
    )
      return false;
  }
  const from = nodePath.relative(repository, importer).split(sep).join("/");
  const to = nodePath.relative(repository, target).split(sep).join("/");
  if (rankRules.some((rule) => rule.from.test(from) && rule.to.test(to)))
    return false;
  return (
    inside(importer, client) ||
    !/(?:^|\/)(?:frontend-vue|@antelopejs\/dms-frontend(?:-vue)?)(?:\/|$)/.test(
      to,
    )
  );
}

/**
 * @param {string} specifier
 * @param {string} importer
 * @param {boolean} viteAssets
 * @returns {boolean}
 */
function permitted(specifier, importer, viteAssets) {
  importer = realpathSync(importer);
  const isClient = inside(importer, client);
  const [source, ...queryParts] = specifier.replaceAll("\\", "/").split("?");
  let request = source;
  const query = queryParts.length ? `?${queryParts.join("?")}` : undefined;
  if (loaderLibraries.has(request.replace(/^node:/, ""))) return false;
  if (!isClient && /^@antelopejs\/dms-frontend(?:-vue)?(?:\/|$)/.test(request))
    return false;
  if (request === "#dms/frontend-module" && isClient) {
    request = "@antelopejs/dms-frontend/templates/vue/frontend-module.ts";
  }
  if (isBuiltin(request)) return query === undefined;
  const resolved = ts.resolveModuleName(
    request,
    importer,
    options,
    ts.sys,
    cache,
  ).resolvedModule;
  const segments = request.split("/");
  const packageSpecifier = /^(?:@[\w.-]+\/)?[\w-][\w.-]*(?:\/[\w.-]+)*$/.test(
    request,
  );
  const target =
    fallbackTarget(request, importer) ?? resolved?.resolvedFileName;
  if (!target) return false;
  const canonical = realpathSync(target);
  if (
    ![target, canonical].every((path) =>
      permittedEdge(importer, path, query, viteAssets),
    )
  )
    return false;
  const skipped = [target, canonical].some((path) =>
    path.split(sep).some((part) => skippedDirectories.has(part)),
  );
  if (
    packageSpecifier &&
    !segments.some((part) => [".", "..", "node_modules"].includes(part)) &&
    resolved?.isExternalLibraryImport
  ) {
    return query === undefined;
  }
  if (skipped) return false;
  return (
    inside(canonical, isClient ? client : server) ||
    (isClient &&
      layers.some(
        (area) =>
          request.startsWith(
            `#${nodePath.basename(nodePath.dirname(area))}/app/`,
          ) && inside(canonical, area),
      ))
  );
}

module.exports = { fallbackTarget, permitted };
