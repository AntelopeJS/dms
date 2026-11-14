const nodePath = require("node:path");
const { sep } = nodePath;
const ts = require("typescript");
const { z } = require("zod");
const { unwrap, constantValue } = require("./syntax.cjs");
const {
  glob: { globSync },
} = require("./frontend-tools.cjs");
const { options, failures } = require("./aliases-context.cjs");
const { permitted } = require("./aliases-permit.cjs");

const specifierSchema = z.string();

/** @param {string} path */
const globPath = (path) => path.split(sep).join("/");
const globOptions = z
  .object({
    query: z.literal("?raw").optional(),
    import: z.literal("default").optional(),
    eager: z.boolean().optional(),
  })
  .strict();

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
      pattern: globPath(nodePath.resolve(nodePath.dirname(importer), pattern)),
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
      pattern: globPath(
        nodePath.resolve(directory, pattern.slice(prefix.length)),
      ),
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
      if (nodePath.resolve(file) !== importer)
        checkSpecifier(
          positive.request(file) + (settings.query ?? ""),
          importer,
        );
    }
  }
  return true;
}

module.exports = { checkSpecifier, checkGlob };
