"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

const legacy = require("./frontend-legacy.cjs");
const { frontend, layers, ts, evaluate, load, isObjectLike } = legacy;

/** @typedef {{ dirs: string[]; presets: string[]; imports: Array<{ from: string; name: string }> }} UnimportInput */

/**
 * @param {URL} url
 * @returns {Promise<{ createUnimport: (options: UnimportInput) => import("unimport").Unimport }>}
 */
const importUnimport = (url) => import(url);

/** @type {(filename: string) => { autoImportDirectories: (roots: Array<{ id: string; root: string }>, builds: Array<{ id: string; setup: unknown }>, fail: (message: string) => never) => string[] }} */
const loadBuildLoader = load;

/** @type {(source: string, filename: string, globals: legacy.ProbeBindings, imports: legacy.ProbeBindings) => { default: unknown }} */
const evaluateBuildFile = evaluate;

/** @type {{ runInNewContext: (code: string, context: object) => Array<Record<string, string[]>> }} */
const defaultsVm = vm;

/**
 * @param {string} templates
 * @returns {{ config: import("typescript").SourceFile; configuredImports: import("typescript").ArrayLiteralExpression }}
 */
function templateImports(templates) {
  const config = ts.createSourceFile(
    "vite.ts",
    fs.readFileSync(path.join(templates, "vite.config.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  /** @type {{ initializer?: import("typescript").Expression }} */
  const configured = {};
  /** @param {import("typescript").Node} node */
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(config) === "imports"
    )
      configured.initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(config);
  const configuredImports = configured.initializer;
  if (!configuredImports || !ts.isArrayLiteralExpression(configuredImports))
    throw new TypeError("The template Vite config has no imports array");
  return { config, configuredImports };
}

async function autoImports() {
  const buildReq = createRequire(
    path.join(frontend, "node_modules/@antelopejs/dms-frontend/package.json"),
  );
  const templates = path.join(
    path.dirname(buildReq.resolve("@antelopejs/dms-frontend/package.json")),
    "templates/vue",
  );
  const { autoImportDirectories } = loadBuildLoader(
    path.join(templates, "frontend-build-loader.ts"),
  );
  const buildFile = path.join(frontend, "dms.frontend.build.ts");
  const { default: setup } = evaluateBuildFile(
    fs.readFileSync(buildFile, "utf8"),
    buildFile,
    {},
    {
      "#dms/frontend-build": {
        /** @param {unknown} value */
        defineDmsFrontendBuild: (value) => value,
      },
    },
  );
  const dirs = autoImportDirectories(
    [{ id: "dms", root: frontend }],
    [{ id: "dms", setup }],
    (message) => {
      throw new Error(message);
    },
  );
  const { config, configuredImports } = templateImports(templates);
  const defaults = defaultsVm.runInNewContext(
    `[${configuredImports.elements
      .filter(ts.isObjectLiteralExpression)
      .map((node) => node.getText(config))
      .join(",")} ]`.replaceAll("import.meta.dirname", "templateRoot"),
    {
      templateRoot: templates,
      /** @param {unknown} value */
      normalizePath: (value) => value,
      resolve: path.resolve,
    },
  );
  const { createUnimport } = await importUnimport(
    pathToFileURL(buildReq.resolve("unimport")),
  );
  const importer = createUnimport({
    dirs,
    presets: configuredImports.elements
      .filter(ts.isStringLiteral)
      .map((node) => node.text),
    imports: defaults.flatMap((value) =>
      Object.entries(value).flatMap(([from, names]) =>
        names.map((name) => ({ from, name })),
      ),
    ),
  });
  await importer.init();
  const entries = await importer.getImports();
  const injection = await importer.injectImports(
    `void [${entries
      .filter((entry) => !entry.type)
      .map((entry) => entry.as ?? entry.name)
      .join(",")}];`,
  );
  const injected = new Set(
    injection.imports.map((entry) => entry.as ?? entry.name),
  );
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "frontend-signatures-"),
  );
  try {
    fs.symlinkSync(
      path.join(frontend, "node_modules"),
      path.join(temporary, "node_modules"),
    );
    const globals = path.join(temporary, "globals.d.ts");
    fs.writeFileSync(globals, await importer.generateTypeDeclarations());
    const options = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      types: [],
      noEmit: true,
      baseUrl: frontend,
      paths: {
        "#dms/frontend-module": [path.join(templates, "frontend-module.ts")],
        ...Object.fromEntries(
          ["auth", "core", "layout", "onboarding", "ui"].map((name) => [
            `#dms-${name}/*`,
            [path.join(frontend, `layers/dms-${name}/*`)],
          ]),
        ),
      },
    };
    const files = entries
      .filter((entry) => path.isAbsolute(entry.from))
      .map((entry) => entry.from);
    const program = ts.createProgram([...files, globals], options);
    return signatures(program, { entries, globals, options, injected });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

/**
 * @param {import("typescript").SourceFile} source
 * @returns {source is import("typescript").SourceFile & { parseDiagnostics: readonly unknown[] }}
 */
function hasParseDiagnostics(source) {
  return (
    Object.hasOwn(source, "parseDiagnostics") &&
    "parseDiagnostics" in source &&
    Array.isArray(source.parseDiagnostics)
  );
}

/** @param {import("typescript").Program} program */
function describeTypes(program) {
  const checker = program.getTypeChecker();
  const flags =
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.InTypeAlias |
    ts.TypeFormatFlags.UseStructuralFallback;
  /** @type {Map<string, string>} */
  const dictionaries = new Map();
  for (const source of program.getSourceFiles()) {
    for (const node of source.statements.filter(ts.isTypeAliasDeclaration)) {
      if (
        !source.fileName.startsWith(frontend) &&
        !(
          ts.isTypeReferenceNode(node.type) &&
          node.type.typeName.getText(source) === "Record"
        )
      )
        continue;
      const type = checker.getTypeAtLocation(node);
      const index = type.getStringIndexType();
      if (
        index &&
        !type.getProperties().length &&
        !type.getCallSignatures().length
      )
        dictionaries.set(
          node.name.text,
          `Record<string, ${checker.typeToString(index, undefined, flags)}>`,
        );
    }
  }
  /**
   * @param {string} text
   * @returns {string}
   */
  const normalize = (text) => {
    const normalized = text
      .replaceAll(frontend.replaceAll("\\", "/"), "<frontend>")
      .replace(/import\("[^"]*\/layers\/[^"]*"\)\./g, "")
      .replace(/import\("[^"]*\/node_modules\/([^"]*)"\)\./g, "$1.")
      .replace(
        /\b[A-Za-z_$][\w$]*\b/g,
        (name) => dictionaries.get(name) ?? name,
      )
      .replace(/\{ \[x: string\]: ([^;{}]+); \}/g, "Record<string, $1>")
      .replace(/(__@\w+)@\d+/g, "$1")
      .replace(/"[^"]+"(?: \| "[^"]+")+/g, (union) =>
        union.split(" | ").sort().join(" | "),
      );
    const source = ts.createSourceFile(
      "signature.ts",
      `type Signature = ${normalized};`,
      ts.ScriptTarget.Latest,
      true,
    );
    const declaration = source.statements[0];
    if (!hasParseDiagnostics(source))
      throw new TypeError("The TypeScript parser reports no parse diagnostics");
    if (
      source.parseDiagnostics.length ||
      !ts.isTypeAliasDeclaration(declaration) ||
      !ts.isTypeLiteralNode(declaration.type) ||
      !declaration.type.members.every(ts.isPropertySignature)
    )
      return normalized;
    const members = [...declaration.type.members].sort((left, right) =>
      left.name.getText(source).localeCompare(right.name.getText(source)),
    );
    return `{ ${members.map((member) => member.getText(source)).join(" ")} }`;
  };
  /**
   * @param {import("typescript").Type} type
   * @param {Set<import("typescript").Type>} [seen]
   * @returns {string}
   */
  const describe = (type, seen = new Set()) => {
    if (seen.has(type))
      return normalize(checker.typeToString(type, undefined, flags));
    const visited = new Set([...seen, type]);
    if (type.isUnion())
      return type.types
        .map((member) => `(${describe(member, visited)})`)
        .sort()
        .join(" | ");
    const index = type.getStringIndexType();
    if (
      index &&
      !type.getProperties().length &&
      !type.getCallSignatures().length
    )
      return `Record<string, ${describe(index, visited)}>`;
    return normalize(checker.typeToString(type, undefined, flags));
  };
  return { describe, normalize };
}

/**
 * @param {import("typescript").Program} program
 * @param {{ entries: import("unimport").Import[]; globals: string; options: import("typescript").CompilerOptions; injected: Set<string> }} context
 */
function signatures(program, { entries, globals, options, injected }) {
  const checker = program.getTypeChecker();
  const { describe, normalize } = describeTypes(program);
  const inventory = entries.map((entry) => {
    const from = path.isAbsolute(entry.from)
      ? entry.from
      : ts.resolveModuleName(entry.from, globals, options, ts.sys)
          .resolvedModule?.resolvedFileName;
    const source = program.getSourceFile(from);
    if (!source) throw new Error(`Missing auto-import source ${entry.from}`);
    const owner = checker.getSymbolAtLocation(source);
    const exported = (owner ? checker.getExportsOfModule(owner) : []).find(
      (symbol) => symbol.name === entry.name,
    );
    const identity = {
      name: entry.as ?? entry.name,
      typeOnly: !!entry.type,
      injected: !entry.type && injected.has(entry.as ?? entry.name),
    };
    if (!exported)
      return {
        ...identity,
        signature: "<unresolved export>",
        declaration: normalize(source.getText()),
      };
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const declaration =
      symbol.valueDeclaration ??
      symbol.declarations?.[0] ??
      exported.declarations[0];
    const type =
      symbol.flags & ts.SymbolFlags.Value
        ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
        : checker.getDeclaredTypeOfSymbol(symbol);
    return {
      ...identity,
      signature: describe(type),
      members:
        entry.type ||
        type.getConstructSignatures().length ||
        symbol.flags & ts.SymbolFlags.Enum
          ? type
              .getProperties()
              .map((member) => ({
                name: member.name.replace(/(__@\w+)@\d+/g, "$1"),
                optional: !!(member.flags & ts.SymbolFlags.Optional),
                signature: describe(
                  checker.getTypeOfSymbolAtLocation(member, declaration),
                ),
              }))
              .sort((left, right) => left.name.localeCompare(right.name))
          : [],
    };
  });
  return [
    ...new Map(
      inventory.map((entry) => [JSON.stringify(entry), entry]),
    ).values(),
  ].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

/**
 * @typedef {{ default: { setup: (sdk: object) => void } }} FrontendEntry
 */

/** @type {(source: string, filename: string, globals: legacy.ProbeBindings, imports: legacy.ProbeBindings, transformers: import("typescript").CustomTransformers) => FrontendEntry} */
const evaluateFrontendEntry = evaluate;

/** @type {(source: string, filename: string, globals: legacy.ProbeBindings, imports: legacy.ProbeBindings) => { default: () => void }} */
const evaluateRegister = evaluate;

/**
 * @param {unknown} value
 * @returns {value is { loader: unknown }}
 */
function hasLoader(value) {
  const holder = isObjectLike(value) || typeof value === "function";
  return holder && "loader" in value && Boolean(value.loader);
}

/**
 * @param {import("typescript").Expression} expression
 * @returns {string}
 */
function patternText(expression) {
  if (!ts.isStringLiteralLike(expression))
    throw new TypeError("import.meta.glob takes string literal patterns");
  return expression.text;
}

function registrations() {
  /** @type {unknown[][]} */
  const events = [];
  /**
   * @param {string} file
   * @returns {FrontendEntry}
   */
  const evaluateEntry = (file) => {
    /** @type {import("typescript").TransformerFactory<import("typescript").SourceFile>} */
    const transform = (context) => (node) => {
      /** @type {import("typescript").Visitor} */
      const visit = (node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.getText().startsWith("import.meta.env.")
        )
          return ts.factory.createFalse();
        if (
          ts.isCallExpression(node) &&
          node.expression.getText() === "import.meta.glob"
        ) {
          const arg = node.arguments[0];
          const patterns = ts.isArrayLiteralExpression(arg)
            ? arg.elements.map(patternText)
            : [patternText(arg)];
          const files = fs.globSync(
            patterns.filter((pattern) => !pattern.startsWith("!")),
            {
              cwd: path.dirname(file),
              exclude: patterns
                .filter((pattern) => pattern.startsWith("!"))
                .map((pattern) => pattern.slice(1)),
            },
          );
          return ts.factory.createObjectLiteralExpression(
            files.map((file) =>
              ts.factory.createPropertyAssignment(
                ts.factory.createStringLiteral(
                  file.startsWith(".") ? file : `./${file}`,
                ),
                ts.factory.createIdentifier("probeLoader"),
              ),
            ),
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(node, visit);
    };
    const imports = new Proxy(
      {},
      {
        has: () => true,
        get: (_, name) => {
          if (name === "vue")
            return { defineAsyncComponent: () => ({ loader: true }) };
          if (name === "#dms/frontend-module")
            return { useDmsRuntimeConfig: () => ({ public: {} }) };
          const specifier = String(name);
          if (specifier.startsWith(".")) {
            const target = path.resolve(path.dirname(file), specifier);
            if (target.includes("/app/entries"))
              return evaluateEntry(
                target.endsWith(".ts") ? target : `${target}.ts`,
              );
          }
          return { default: name, __esModule: true };
        },
      },
    );
    return evaluateFrontendEntry(
      fs.readFileSync(file, "utf8"),
      file,
      { probeLoader: () => {} },
      imports,
      { before: [transform] },
    );
  };
  const module = evaluateEntry(path.join(frontend, "dms.frontend.ts")).default;
  /** @type {Record<PropertyKey, unknown>} */
  const sdkTarget = { options: { public: {} } };
  const sdk = new Proxy(sdkTarget, {
    get(target, key) {
      if (key in target) return target[key];
      return /** @param {...unknown} args */ (...args) =>
        events.push([
          key,
          ...args.map((value) => (hasLoader(value) ? "<component>" : value)),
        ]);
    },
  });
  module.setup(sdk);
  const registerFile = path.join(layers, "dms-ui/app/plugins/register.ts");
  const registrations = new Proxy(
    {},
    {
      has: () => true,
      get: () =>
        new Proxy(
          {},
          { get: (_, name) => () => events.push(["register", String(name)]) },
        ),
    },
  );
  evaluateRegister(
    fs.readFileSync(registerFile, "utf8"),
    registerFile,
    {
      /** @param {unknown} setup */
      defineDmsPlugin: (setup) => setup,
    },
    registrations,
  ).default();
  return events;
}

/**
 * @typedef {{
 *   success: boolean;
 *   testResults: Array<{ assertionResults: Array<{ fullName: string; status: string }> }>;
 * }} VitestReport
 */

/**
 * @param {unknown} value
 * @returns {value is { fullName: string; status: string }}
 */
function isAssertionResult(value) {
  return (
    isObjectLike(value) &&
    Object.hasOwn(value, "fullName") &&
    typeof value.fullName === "string" &&
    Object.hasOwn(value, "status") &&
    typeof value.status === "string"
  );
}

/**
 * @param {unknown} value
 * @returns {value is { assertionResults: Array<{ fullName: string; status: string }> }}
 */
function isFileResult(value) {
  return (
    isObjectLike(value) &&
    Object.hasOwn(value, "assertionResults") &&
    Array.isArray(value.assertionResults) &&
    value.assertionResults.every(isAssertionResult)
  );
}

/**
 * @param {unknown} value
 * @returns {value is VitestReport}
 */
function isVitestReport(value) {
  return (
    isObjectLike(value) &&
    Object.hasOwn(value, "success") &&
    typeof value.success === "boolean" &&
    Object.hasOwn(value, "testResults") &&
    Array.isArray(value.testResults) &&
    value.testResults.every(isFileResult)
  );
}

/**
 * @param {unknown} error
 * @returns {error is { stack: string }}
 */
function hasStack(error) {
  return (
    isObjectLike(error) && "stack" in error && typeof error.stack === "string"
  );
}

function behavioralTests() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-tests-"));
  const report = path.join(temporary, "report.json");
  try {
    const tests =
      `download-action-target table-row-action-errors table-metric-cells table-pills-cell table-view-sources table-view-reorder table-view-expanded-row-details repeater-table form-create-wording form-submit-clear form-server-field-errors instant-save site-layout-resync site-layout-refresh realtime-shared-connection permission-preview`
        .split(" ")
        .map((name) => `tests/${name}.test.ts`);
    execFileSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        ...tests,
        "--maxWorkers=2",
        "--reporter=json",
        `--outputFile=${report}`,
      ],
      { cwd: frontend, stdio: "pipe", maxBuffer: 16 * 1024 * 1024 },
    );
    /** @type {unknown} */
    const result = JSON.parse(fs.readFileSync(report, "utf8"));
    if (!isVitestReport(result) || !result.success)
      throw new Error("Frontend behavioral tests failed");
    return result.testResults
      .flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          status: test.status,
        })),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

(async () => {
  /** @type {Awaited<ReturnType<typeof legacy.observe>> & { autoImports: Awaited<ReturnType<typeof autoImports>>; registrations: ReturnType<typeof registrations>; behavioralTests?: ReturnType<typeof behavioralTests> }} */
  const result = {
    ...(await legacy.observe()),
    autoImports: await autoImports(),
    registrations: registrations(),
  };
  if (process.argv.includes("--tests"))
    result.behavioralTests = behavioralTests();
  process.stdout.write(`${JSON.stringify(result)}\n`);
})().catch(
  /** @param {unknown} error */
  (error) => {
    process.stderr.write(`${hasStack(error) ? error.stack : undefined}\n`);
    process.exitCode = 1;
  },
);
