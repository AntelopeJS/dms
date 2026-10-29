const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join, resolve, basename, relative, sep } = require("node:path");
const { satisfies, validRange } = require("semver");
const ts = require("typescript");
const { ACTIONS, TRIGGERS } = require("../dist/automation");
const checkTarget = require("./backend-import-target.cjs");

const root = resolve(__dirname, "..");
const localeRoot = join(root, "frontend-vue/layers/dms-core/i18n/locales");
const locales = ["core-en-GB.json", "core-fr-FR.json"];
const emailNames = [
  "EmailAdminInvite",
  "EmailChangeNotice",
  "EmailChangeVerification",
  "EmailExportReady",
  "EmailResetPassword",
  "EmailTwoFactor",
  "EmailUserValidation",
];

function schemaTexts(where, schema) {
  return Object.entries(schema.properties ?? {}).flatMap(([name, property]) => [
    { where: `${where}.${name}.title`, text: property.title },
    ...(property.description === undefined
      ? []
      : [
          { where: `${where}.${name}.description`, text: property.description },
        ]),
  ]);
}

const texts = [
  ...TRIGGERS.flatMap((trigger) => [
    { where: `${trigger.id}.name`, text: trigger.name },
    { where: `${trigger.id}.description`, text: trigger.description },
    ...schemaTexts(`${trigger.id}.config`, trigger.configSchema),
    ...schemaTexts(`${trigger.id}.output`, trigger.outputSchema),
  ]),
  ...ACTIONS.flatMap((action) => [
    { where: `${action.id}.name`, text: action.name },
    { where: `${action.id}.description`, text: action.description },
    ...schemaTexts(`${action.id}.input`, action.inputSchema),
    ...schemaTexts(`${action.id}.output`, action.outputSchema),
  ]),
];

for (const { where, text } of texts) {
  assert.match(
    text,
    /^\$dms\.automation\./,
    `${where} must use an automation locale key`,
  );
}

for (const file of locales) {
  const messages = JSON.parse(readFileSync(join(localeRoot, file), "utf8"));
  for (const key of [
    ...texts.map(({ text }) => text.slice(1)),
    "error.tenant_owner_required",
    "error.tenant_member_required",
  ]) {
    const message = key
      .split(".")
      .reduce((node, part) => node?.[part], messages);
    assert.match(message, /\S/, `${file} must translate ${key}`);
  }
}

const components = readdirSync(
  join(root, "frontend-vue/layers/dms-layout/app/emails"),
)
  .filter((file) => file.endsWith(".vue"))
  .map((file) => basename(file, ".vue"));
assert.deepEqual(components.sort(), emailNames.sort());

const lockfile = readFileSync(join(root, "../../pnpm-lock.yaml"), "utf8");
const locked = [
  ...lockfile.matchAll(/^ {2}'@antelopejs\/dms-frontend@([^'(]+)':$/gm),
].map(([, version]) => version);
assert.notDeepEqual(locked, []);
for (const layer of ["frontend-vue", "playground/frontend-vue"]) {
  const manifest = JSON.parse(
    readFileSync(join(root, layer, "package.json"), "utf8"),
  );
  const range = manifest.engines?.["@antelopejs/dms-frontend"];
  assert.match(range, /./, `${layer} renderer range`);
  assert.notEqual(validRange(range), null, `${layer} renderer range`);
  for (const version of locked) {
    assert.ok(
      satisfies(version, range),
      `${layer} must admit renderer ${version}`,
    );
  }
}

const constructorExemptions = {
  "implementations/dms-base/bulk-selection.ts:104":
    "      (thisObj as ControllerInstance).constructor,",
  "implementations/dms-base/search-route.ts:66":
    "  const columnType = GetMetadata(target.thisObj.constructor, TableViewMeta)",
  "implementations/dms-base/search-route.ts:166":
    "  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);",
  "implementations/dms-base/search-route.ts:200":
    "  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);",
  "implementations/dms-base/search-route.ts:246":
    "  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);",
  "implementations/dms-base/search-route.ts:304":
    "    const searchableMeta = GetMetadata(thisObj.constructor, SearchableMeta);",
  "implementations/dms-base/search-route.ts:401":
    "      const entryInstance = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:88":
    "        model.constructor.fromDatabase(entry),",
  "implementations/dms-base/table-view.ts:124":
    "    controller.constructor as ConstructorParameters<typeof TableViewMeta>[0],",
  "implementations/dms-base/table-view.ts:190":
    "    controller.constructor as ControllerClass;",
  "implementations/dms-base/table-view.ts:390":
    "      model.constructor.fromDatabase(row),",
  "implementations/dms-base/table-view.ts:454":
    "  const tableViewMetadata = GetMetadata(controller.constructor, TableViewMeta);",
  "implementations/dms-base/table-view.ts:484":
    "  const tableViewMetadata = GetMetadata(controller.constructor, TableViewMeta);",
  "test/helpers/invite-entry-fixtures.ts:92":
    "  const controller = await GetControllerInstance(route.proto.constructor, ctx);",
  "test/helpers/invite-entry-fixtures.ts:127":
    "  const controller = await GetControllerInstance(route.proto.constructor, ctx);",
  "test/helpers/invite-entry-fixtures.ts:146":
    "  const controller = await GetControllerInstance(route.proto.constructor, ctx);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:75":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:86":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
};
const builtinExemptions = {
  "test/unit/interfaces/dms-base/table-view-evaluation-order.fixture.ts:1":
    'import Module, { findPackageJSON } from "node:module";',
};
const requireResolveExemptions = {
  "src/store/compatibility.ts:32":
    "  let folder = path.dirname(require.resolve(INTERFACE_ENTRY));",
  "dist/store/compatibility.js:26":
    "    let folder = node_path_1.default.dirname(require.resolve(INTERFACE_ENTRY));",
};
const usedRequireResolveExemptions = new Set();
const sourceExemptions = { ...constructorExemptions, ...builtinExemptions };
const usedExemptions = new Set();
const processMembers = new Set([
  "env",
  "pid",
  "cwd",
  "stdout",
  "exit",
  "stderr",
  "execPath",
  "hrtime",
]);

function memberName(node) {
  const parent = node.parent;
  return (
    (parent.name === node &&
      [
        ts.SyntaxKind.PropertyAccessExpression,
        ts.SyntaxKind.PropertyAssignment,
        ts.SyntaxKind.PropertySignature,
        ts.SyntaxKind.PropertyDeclaration,
        ts.SyntaxKind.MethodDeclaration,
      ].includes(parent.kind)) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    ts.isQualifiedName(parent)
  );
}

function exempt(node, path, exemptions) {
  const source = node.getSourceFile();
  const file = relative(join(root, "src"), path).split(sep).join("/");
  const line =
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const location = `${file}:${line}`;
  if (!Object.hasOwn(exemptions, location)) return false;
  usedExemptions.add(location);
  return true;
}

function checkBuiltin(expression, path) {
  if (["module", "node:module", "vm", "node:vm"].includes(expression.text)) {
    assert.ok(
      expression.text === "node:module" &&
        ts.isImportDeclaration(expression.parent) &&
        exempt(expression.parent, path, builtinExemptions),
      `${path} builtin loader imports are forbidden outside pinned exemptions`,
    );
  }
}

function checkConstructor(node, path) {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "constructor") {
    assert.ok(
      exempt(node.name, path, constructorExemptions),
      `${path} constructor access is forbidden outside pinned exemptions`,
    );
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    assert.notEqual(
      node.argumentExpression.text,
      "constructor",
      `${path} computed constructor access is forbidden`,
    );
  }
}

function checkSourceRoots(source, path) {
  const file = relative(join(root, "src"), path).split(sep).join("/");
  const lines = source.text.split(/\r?\n/);
  let checker;
  for (const [location, text] of Object.entries(sourceExemptions)) {
    if (!location.startsWith(`${file}:`)) continue;
    const line = Number(location.slice(file.length + 1));
    assert.equal(
      lines[line - 1],
      text,
      `${location} loader exemption moved or changed`,
    );
  }
  function localBinding(node) {
    if (!checker) {
      const options = {
        noResolve: true,
        noLib: true,
        types: [],
        allowJs: true,
      };
      const host = ts.createCompilerHost(options);
      host.getSourceFile = (name) => (name === path ? source : undefined);
      checker = ts.createProgram([path], options, host).getTypeChecker();
    }
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
    return symbol?.declarations?.some(
      (declaration) =>
        declaration.getSourceFile() === source &&
        !(
          ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient
        ) &&
        (ts.isParameter(declaration) ||
          ts.isBindingElement(declaration) ||
          (ts.isVariableDeclaration(declaration) &&
            (declaration.initializer ||
              ts.isForOfStatement(declaration.parent.parent) ||
              ts.isForInStatement(declaration.parent.parent)) &&
            declaration.parent.flags & ts.NodeFlags.BlockScoped)),
    );
  }
  function sourceRoot(node) {
    if (!["module", "exports", "process"].includes(node.text)) return;
    const parent = node.parent;
    assert.ok(
      !(
        ts.isPropertyAccessExpression(parent) &&
        parent.name === node &&
        ts.isIdentifier(parent.expression) &&
        ["global", "globalThis"].includes(parent.expression.text)
      ),
      `${path} global loader-root access is forbidden`,
    );
    if (memberName(node)) return;
    if (["module", "exports"].includes(node.text) && localBinding(node)) return;
    const dotted =
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === node &&
      !parent.questionDotToken;
    if (node.text === "module") {
      assert.ok(
        dotted && parent.name.text === "exports",
        `${path} module is allowed only as module.exports`,
      );
    } else if (node.text === "exports") {
      assert.ok(
        dotted &&
          ts.isBinaryExpression(parent.parent) &&
          parent.parent.left === parent &&
          parent.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken,
        `${path} exports is allowed only in exports.<name> assignments`,
      );
    } else if (node.text === "process") {
      assert.ok(
        dotted && processMembers.has(parent.name.text),
        `${path} process must use an allowlisted dotted member`,
      );
    }
  }
  function visit(node) {
    if (ts.isIdentifier(node)) sourceRoot(node);
    checkConstructor(node, path);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function pinnedRequireResolve(node, source, path) {
  const member = node.parent;
  if (
    !ts.isPropertyAccessExpression(member) ||
    member.expression !== node ||
    member.name.text !== "resolve"
  )
    return false;
  const line =
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const location = `${relative(root, path).split(sep).join("/")}:${line}`;
  assert.ok(
    Object.hasOwn(requireResolveExemptions, location),
    `${location} require.resolve is forbidden outside pinned exemptions`,
  );
  assert.equal(
    source.text.split(/\r?\n/)[line - 1],
    requireResolveExemptions[location],
    `${location} require.resolve exemption moved or changed`,
  );
  usedRequireResolveExemptions.add(location);
  return true;
}

function checkSource(source, path, boundary, compiled) {
  function checkSpecifier(
    expression,
    runtime = false,
    esm = !runtime && /\.(?:mjs|mts|js|jsx)$/.test(path),
  ) {
    const line =
      source.getLineAndCharacterOfPosition(expression?.getStart(source) ?? 0)
        .line + 1;
    assert.ok(
      expression && ts.isStringLiteral(expression),
      `${path}:${line} imports must use a plain string literal specifier`,
    );
    if (!compiled) checkBuiltin(expression, path);
    checkTarget(expression.text, path, boundary, compiled, { runtime, esm });
  }
  function metadataType(node) {
    const value = ts.isArrayLiteralExpression(node.parent) ? node.parent : node;
    const call = value.parent;
    return (
      compiled &&
      ts.isCallExpression(call) &&
      ts.isIdentifier(call.expression) &&
      call.expression.text === "__metadata" &&
      call.arguments[1] === value &&
      ts.isStringLiteral(call.arguments[0]) &&
      ["design:type", "design:paramtypes", "design:returntype"].includes(
        call.arguments[0].text,
      )
    );
  }
  function sensitiveName(name) {
    return [
      "require",
      "createRequire",
      "mainModule",
      "eval",
      "Function",
    ].includes(name);
  }
  function computedReceiver(node) {
    while (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node)
    )
      node = node.expression;
    return (
      ts.isIdentifier(node) &&
      ["module", "process", "globalThis", "global"].includes(node.text)
    );
  }
  function checkIdentifier(node) {
    if (node.text === "require" && !pinnedRequireResolve(node, source, path)) {
      assert.ok(
        ts.isCallExpression(node.parent) &&
          node.parent.expression === node &&
          !node.parent.questionDotToken,
        `${path} indirect require is forbidden`,
      );
      checkSpecifier(node.parent.arguments[0], true);
    }
    assert.ok(
      !["createRequire", "mainModule", "eval", "Function"].includes(
        node.text,
      ) ||
        (node.text === "Function" && metadataType(node)),
      `${path} loader construction or dynamic evaluation is forbidden: ${node.text}`,
    );
  }
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (ts.isExternalModuleReference(node)) {
      specifier = node.expression;
    } else if (ts.isImportTypeNode(node)) {
      checkSpecifier(
        ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
          : node.argument,
      );
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const native = compiled || /\.(?:mjs|mts|cjs|js|jsx)$/.test(path);
      checkSpecifier(node.arguments[0], native, native);
    }
    if (specifier)
      checkSpecifier(specifier, ts.isExternalModuleReference(node));
    if (ts.isIdentifier(node)) checkIdentifier(node);
    if (ts.isElementAccessExpression(node)) {
      assert.ok(
        !computedReceiver(node.expression) &&
          !(
            ts.isStringLiteral(node.argumentExpression) &&
            sensitiveName(node.argumentExpression.text)
          ),
        `${path} computed loader access is forbidden`,
      );
    }
    if (
      (ts.isBindingElement(node) ||
        ts.isImportSpecifier(node) ||
        ts.isExportSpecifier(node)) &&
      node.propertyName
    ) {
      assert.ok(
        !ts.isComputedPropertyName(node.propertyName) &&
          !sensitiveName(node.propertyName.text),
        `${path} indirect loader binding is forbidden`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function checkImports(directory, boundary = directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.ok(
      !entry.isSymbolicLink(),
      `${path} backend dependency files must not use symbolic links`,
    );
    if (entry.isDirectory()) {
      checkImports(path, boundary);
      continue;
    }
    const compiled = boundary === join(root, "dist");
    assert.ok(
      compiled || entry.name !== "package.json",
      `${path} backend source package manifests are forbidden`,
    );
    assert.ok(
      /\.(?:ts|tsx|cts|mts|js|jsx|cjs|mjs|json|map|tsbuildinfo)$/.test(path),
      `${path} unsupported backend executable suffix; dependency-cruiser must parse every executable file`,
    );
    if (/\.(?:json|map|tsbuildinfo)$/.test(entry.name)) {
      JSON.parse(readFileSync(path, "utf8"));
      continue;
    }
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    checkTarget.checkCapabilities(source, path);
    if (!compiled) checkSourceRoots(source, path);
    checkSource(source, path, boundary, compiled);
  }
}

checkImports(join(root, "dist"));
checkImports(join(root, "src"));
assert.equal(
  usedExemptions.size,
  Object.keys(sourceExemptions).length,
  "Every pinned loader exemption must still be used",
);
assert.equal(
  usedRequireResolveExemptions.size,
  Object.keys(requireResolveExemptions).length,
  "Every pinned require.resolve exemption must still be used",
);
process.stdout.write("Backend invariant checks passed.\n");
