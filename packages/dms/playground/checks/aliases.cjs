const { readdirSync, readFileSync, realpathSync } = require("node:fs");
const { isBuiltin } = require("node:module");
const nodePath = require("node:path");
const { sep } = nodePath;
const ts = require("typescript");
const { z } = require("zod");
const {
  unwrap,
  constantValue,
  importMeta,
  propertyName,
  loaderReference,
} = require("./syntax.cjs");

const root = nodePath.resolve(__dirname, "..");
const repository = nodePath.resolve(root, "../../..");
const config = ts.readConfigFile(
  nodePath.join(repository, ".dependency-cruiser.tsconfig.json"),
  (path) => ts.sys.readFile(path),
);
const { options } = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  repository,
);
const cache = ts.createModuleResolutionCache(
  repository,
  (path) => path,
  options,
);
const {
  vue: { parse, compileTemplate },
  glob: { globSync },
  css,
} = require("./frontend-tools.cjs");
const server = realpathSync(nodePath.join(root, "src"));
const client = realpathSync(nodePath.join(root, "frontend-vue"));
const layers = ["core", "ui", "layout", "auth", "onboarding"].map((layer) =>
  realpathSync(nodePath.join(root, `../frontend-vue/layers/dms-${layer}/app`)),
);
const specifierSchema = z.string();
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
const globalMethods = new Map([
  ["window", new Set(["addEventListener", "removeEventListener"])],
  ["process", new Set(["uptime"])],
]);
const globOptions = z
  .object({
    query: z.literal("?raw").optional(),
    import: z.literal("default").optional(),
    eager: z.boolean().optional(),
  })
  .strict();
const skippedDirectories = new Set([
  "node_modules",
  "dist",
  ".nuxt",
  ".output",
]);
const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
]);
const nonExecutableKinds = new Map([
  [".json", "json"],
  ["?raw", "vite"],
  ["?url", "vite"],
]);
const trustedManifests = new Map([
  [
    nodePath.join(root, "package.json"),
    new Set([
      "name",
      "version",
      "private",
      "main",
      "packageManager",
      "scripts",
      "devDependencies",
      "antelopeJs",
      "dependencies",
    ]),
  ],
  [
    nodePath.join(client, "package.json"),
    new Set(["name", "version", "private", "type", "main", "engines"]),
  ],
]);
const styleNodes = new Set([
  "StyleSheet",
  "Rule",
  "SelectorList",
  "Selector",
  "ClassSelector",
  "Block",
  "Declaration",
  "Value",
  "Identifier",
  "Dimension",
  "Function",
  "Number",
  "Combinator",
  "Operator",
  "Percentage",
  "PseudoClassSelector",
  "Hash",
]);
const styleFunctions = new Set([
  "var",
  "color-mix",
  "radial-gradient",
  "linear-gradient",
]);
const vueScriptKinds = new Map([
  ["js", ts.ScriptKind.JS],
  ["jsx", ts.ScriptKind.JSX],
  ["ts", ts.ScriptKind.TS],
  ["tsx", ts.ScriptKind.TSX],
]);
/** @type {string[]} */
const failures = [];

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

/**
 * @param {unknown} value
 * @param {string} path
 * @param {boolean} [viteAssets]
 */
function checkSpecifier(value, path, viteAssets = true) {
  const specifier = specifierSchema.safeParse(value);
  if (!specifier.success) {
    failures.push(
      `${path}: playground import must be a static constant string`,
    );
  } else if (
    specifier.data.includes("#", 1) ||
    specifier.data.includes("%") ||
    specifier.data.split("?")[0].toLowerCase().endsWith(".css") ||
    !permitted(specifier.data, path, viteAssets)
  ) {
    failures.push(`${path}: forbidden playground import ${specifier.data}`);
  }
}

/**
 * @param {string} pattern
 * @param {string} importer
 * @returns {{ pattern: string, request: (file: string) => string } | undefined}
 */
function globPattern(pattern, importer) {
  if (pattern.startsWith("./") || pattern.startsWith("../")) {
    return {
      pattern: nodePath.resolve(nodePath.dirname(importer), pattern),
      request: (file) =>
        `./${nodePath.relative(nodePath.dirname(importer), file).split(sep).join("/")}`,
    };
  }
  if (!/^#dms-(?:core|ui|layout|auth|onboarding)\/app\//.test(pattern))
    return undefined;
  for (const [alias, targets] of Object.entries(options.paths)) {
    const prefix = alias.replace(/\*$/, "");
    if (!pattern.startsWith(prefix)) continue;
    const directory = nodePath.resolve(
      options.baseUrl,
      targets[0].replace(/\*$/, ""),
    );
    return {
      pattern: nodePath.resolve(directory, pattern.slice(prefix.length)),
      request: (file) =>
        prefix + nodePath.relative(directory, file).split(sep).join("/"),
    };
  }
  return undefined;
}

/**
 * @param {ts.Expression | undefined} argument
 * @returns {z.infer<typeof globOptions> | false | undefined}
 */
function permittedGlobSettings(argument) {
  const settings = argument && unwrap(argument);
  const values = {};
  if (settings) {
    if (!ts.isObjectLiteralExpression(settings)) return false;
    for (const property of settings.properties) {
      if (!ts.isPropertyAssignment(property)) return false;
      const key = ts.isIdentifier(property.name)
        ? property.name.text
        : constantValue(property.name);
      const value = constantValue(property.initializer);
      if (key === undefined || value === undefined) return false;
      values[key] = value;
    }
  }
  const parsed = globOptions.safeParse(values);
  return parsed.success ? parsed.data : undefined;
}

/**
 * @param {ts.CallExpression} node
 * @param {string} importer
 * @returns {boolean}
 */
function checkGlob(node, importer) {
  const argument = node.arguments[0] && unwrap(node.arguments[0]);
  const expressions =
    argument && ts.isArrayLiteralExpression(argument)
      ? argument.elements
      : [argument];
  const parsed = z
    .array(z.string())
    .safeParse(
      expressions.map((expression) => expression && constantValue(expression)),
    );
  const settings = permittedGlobSettings(node.arguments[1]);
  if (!parsed.success || !settings || node.arguments.length > 2) return false;
  /** @type {NonNullable<ReturnType<typeof globPattern>>[]} */
  const positives = [];
  /** @type {NonNullable<ReturnType<typeof globPattern>>[]} */
  const negatives = [];
  for (const pattern of parsed.data) {
    const negative = pattern.startsWith("!");
    const resolved = globPattern(
      negative ? pattern.slice(1) : pattern,
      importer,
    );
    if (!resolved) return false;
    (negative ? negatives : positives).push(resolved);
  }
  for (const positive of positives) {
    for (const file of globSync(positive.pattern, {
      absolute: true,
      dot: false,
      expandDirectories: false,
      ignore: [
        "**/node_modules/**",
        ...negatives.map((negative) => negative.pattern),
      ],
    })) {
      if (file !== importer)
        checkSpecifier(
          positive.request(file) + (settings.query ?? ""),
          importer,
        );
    }
  }
  return true;
}

/**
 * @param {ts.CallExpression} node
 * @param {string} path
 * @param {WeakSet<ts.Node>} allowed
 */
function checkCall(node, path, allowed) {
  const callee = unwrap(node.expression);
  if (
    (ts.isPropertyAccessExpression(callee) ||
      ts.isElementAccessExpression(callee)) &&
    importMeta(unwrap(callee.expression)) &&
    propertyName(callee) === "glob"
  ) {
    allowed.add(unwrap(callee.expression));
    if (!checkGlob(node, path))
      failures.push(`${path}: unsupported playground glob`);
  } else if (
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    !node.questionDotToken &&
    node.arguments.length === 1
  ) {
    allowed.add(node.expression);
    checkSpecifier(constantValue(node.arguments[0]), path, false);
  } else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    allowed.add(node.expression);
    checkSpecifier(
      node.arguments[0] ? constantValue(node.arguments[0]) : undefined,
      path,
    );
  } else if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    globalMethods.get(callee.expression.text)?.has(callee.name.text)
  ) {
    allowed.add(callee.expression);
  }
}

/**
 * @param {string} text
 * @param {string} path
 * @param {ts.ScriptKind} [kind]
 */
function checkScript(text, path, kind = ts.getScriptKindFromFileName(path)) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  if (source.parseDiagnostics.length) {
    for (const diagnostic of source.parseDiagnostics)
      failures.push(
        `${path}: invalid playground script: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    return;
  }
  const allowed = new WeakSet();
  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isCallExpression(node)) checkCall(node, path, allowed);
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      checkSpecifier(constantValue(node.moduleSpecifier), path);
    } else if (ts.isExternalModuleReference(node) && node.expression) {
      checkSpecifier(constantValue(node.expression), path, false);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      checkSpecifier(constantValue(node.argument.literal), path);
    }
    const unsupported = !allowed.has(node) && loaderReference(node);
    if (unsupported)
      failures.push(`${path}: unsupported playground loader ${unsupported}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

/**
 * @param {import("vue/compiler-sfc").SFCStyleBlock} block
 * @param {string} path
 */
function checkStyle(block, path) {
  if (block.src !== undefined) {
    failures.push(`${path}: external playground styles are forbidden`);
    return;
  }
  try {
    if ((block.lang ?? "css") !== "css" || block.content.includes("\\"))
      throw new Error("unsupported style language or escape");
    const ast = css.parse(block.content, {
      parseCustomProperty: true,
      onParseError(error) {
        throw error;
      },
    });
    css.walk(ast, (node) => {
      if (
        !styleNodes.has(node.type) ||
        (node.type === "Function" && !styleFunctions.has(node.name)) ||
        (node.type === "PseudoClassSelector" && node.name !== "hover")
      )
        throw new Error(`unsupported style node ${node.type}`);
    });
  } catch {
    failures.push(`${path}: unsupported playground inline style`);
  }
}

/** @param {string} path */
function checkVue(path) {
  const { descriptor, errors } = parse(readFileSync(path, "utf8"), {
    filename: path,
  });
  if (errors.length) throw new Error(`${path}: ${errors.join("; ")}`);
  for (const block of descriptor.customBlocks)
    failures.push(
      `${path}: playground custom block ${block.type} is forbidden`,
    );
  for (const block of descriptor.styles) checkStyle(block, path);
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    if (block.src !== undefined) {
      failures.push(`${path}: external playground scripts are forbidden`);
      continue;
    }
    const kind = vueScriptKinds.get(block.lang ?? "js");
    if (kind === undefined) {
      failures.push(
        `${path}: unsupported playground script language ${block.lang}`,
      );
      continue;
    }
    checkScript(block.content, path, kind);
  }
  const template = descriptor.template;
  if (!template) return;
  let filename = path;
  let source = template.content;
  if (template.src !== undefined) {
    checkSpecifier(template.src, path, false);
    if (!permitted(template.src, path, false)) return;
    filename = fallbackTarget(template.src, path);
    if (!filename) {
      failures.push(`${path}: unsupported playground template source`);
      return;
    }
    source = readFileSync(filename, "utf8");
  }
  const compiled = compileTemplate({
    source,
    filename,
    id: path,
    preprocessLang: template.lang,
    compilerOptions: { expressionPlugins: ["typescript"] },
  });
  if (compiled.errors.length)
    throw new Error(`${path}: ${compiled.errors.join("; ")}`);
  checkScript(compiled.code, filename, ts.ScriptKind.TS);
}

/** @param {string} path */
function checkManifest(path) {
  const fields = trustedManifests.get(path);
  if (!fields) {
    failures.push(
      `${path}: additional playground package metadata is forbidden`,
    );
    return;
  }
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  for (const field of Object.keys(manifest))
    if (!fields.has(field))
      failures.push(`${path}: unsupported playground package field ${field}`);
}

/** @param {string} directory */
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = nodePath.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push(`${path}: playground source symlinks are forbidden`);
    } else if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        checkDirectory(path);
      }
    } else if (entry.name === "package.json") {
      checkManifest(path);
    } else if (entry.name.endsWith(".css")) {
      failures.push(`${path}: playground CSS files are forbidden`);
    } else if (entry.name.endsWith(".vue")) {
      checkVue(path);
    } else if (codeExtensions.has(nodePath.extname(entry.name))) {
      checkScript(readFileSync(path, "utf8"), path);
    }
  }
}

checkManifest(nodePath.join(root, "package.json"));
checkDirectory(nodePath.join(root, "src"));
checkDirectory(nodePath.join(root, "frontend-vue"));
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Playground import checks passed.\n");
}
