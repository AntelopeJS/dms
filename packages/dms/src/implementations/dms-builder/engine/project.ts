import fs from "node:fs";
import path from "node:path";
import { IndentationText, Project, ts } from "ts-morph";
import { getBuilderConfig } from "../../../config";
import { isNumber } from "./scalar-guards";
import { isPlainObject } from "./value";

/**
 * The compiler options of the DMS project template, for a project that has no `tsconfig.json`: a
 * module the builder scaffolds there compiles with them, and the builder typechecks with them.
 */
export const DEFAULT_COMPILER_OPTIONS = {
  moduleResolution: "bundler",
  target: "esnext",
  module: "commonjs",
  lib: ["ES2020"],
  types: ["node"],
  strict: true,
  esModuleInterop: true,
  resolveJsonModule: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  declaration: true,
  sourceMap: true,
  useDefineForClassFields: true,
} satisfies Record<string, string | boolean | string[]>;

/**
 * ts-morph's TypeScript predates `moduleResolution: "bundler"` with `module: "commonjs"`, which
 * the template's own compiler accepts; `preserve` resolves the same way for a typecheck.
 */
const CHECKER_MODULE = "preserve";

const UNCHECKED_PATTERNS = [
  "**/node_modules/**",
  ".antelope/**",
  "antelope.config.*",
];

export function resolveProjectRoot(): string {
  const configured = getBuilderConfig().projectRoot;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return process.cwd();
}

function findTsConfig(rootDir: string): string | undefined {
  let current = rootDir;
  while (true) {
    const candidate = path.join(current, "tsconfig.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

const INDENT_SAMPLE_BYTES = 8192;

/**
 * Match the indentation the project already uses, rather than imposing one:
 * generated code sits in the author's files and should not read as foreign.
 */
/**
 * The `.editorconfig` settings that govern TypeScript, in file order.
 *
 * Matching the whole file section-blind reads a `[*.{yml,json}]` stanza as if
 * it applied to `.ts`, so a project whose TypeScript is tab-indented gets
 * re-indented with spaces. Later sections win, as editorconfig specifies.
 */
function editorconfigSettings(text: string): Map<string, string> {
  const settings = new Map<string, string>();
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    const section = /^\[(.+)]$/.exec(line);
    if (section?.[1]) {
      applies = sectionCoversTypeScript(section[1]);
      continue;
    }
    if (!applies) {
      continue;
    }
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0) {
      settings.set(key.trim().toLowerCase(), rest.join("=").trim());
    }
  }
  return settings;
}

/**
 * One glob as a regular expression: `**` crosses directories, `*` does not,
 * `?` is any one character, and everything else is matched literally. Split on
 * the wildcards rather than substituting a placeholder, so no sentinel can
 * collide with the pattern's own text.
 */
function globExpression(glob: string): string {
  const literal = (text: string): string =>
    text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return glob
    .split("**")
    .map((crossing) =>
      crossing
        .split("*")
        .map((segment) => literal(segment).replace(/\?/g, "."))
        .join("[^/]*"),
    )
    .join(".*");
}

/** Whether a section's glob matches a `.ts` file. */
function sectionCoversTypeScript(glob: string): boolean {
  const patterns = glob.startsWith("{") ? glob.slice(1, -1).split(",") : [glob];
  return patterns.some((pattern) => {
    const trimmed = pattern.trim();
    if (trimmed === "*" || trimmed === "**") {
      return true;
    }
    const braces = /^(.*)\{([^}]*)}(.*)$/.exec(trimmed);
    const candidates = braces
      ? braces[2]
          ?.split(",")
          .map((entry) => `${braces[1] ?? ""}${entry.trim()}${braces[3] ?? ""}`)
      : [trimmed];
    return (candidates ?? []).some((candidate) =>
      new RegExp(`^${globExpression(candidate)}$`).test("file.ts"),
    );
  });
}

/**
 * A config file, searched for from `rootDir` upwards.
 *
 * A project root is not always where its tooling is configured — an app inside
 * a repository is formatted by the repository's config — and both biome and
 * prettier resolve theirs by walking up, so this does too.
 */
function findUpwards(rootDir: string, names: string[]): string | undefined {
  let current = path.resolve(rootDir);
  for (;;) {
    for (const name of names) {
      const candidate = path.join(current, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    if (fs.existsSync(path.join(current, ".git"))) {
      return undefined;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

/**
 * What the project's formatter is configured to do. It outranks every other
 * signal: whatever the sources look like today, the formatter is what they
 * will look like after the next `pnpm format`. Biome names the settings
 * `indentStyle`/`indentWidth`, prettier `useTabs`/`tabWidth`. Comments are
 * stripped so a `.jsonc` parses; a config the builder cannot read is simply no
 * signal, not a failure.
 */
function formatterIndentation(rootDir: string): IndentationText | undefined {
  const config = findUpwards(rootDir, [
    "biome.json",
    "biome.jsonc",
    ".prettierrc",
    ".prettierrc.json",
  ]);
  if (!config) {
    return undefined;
  }
  let parsed: unknown;
  try {
    const text = fs
      .readFileSync(config, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"])\/\/.*$/gm, "$1");
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) {
    return undefined;
  }
  const nested = parsed.formatter ?? parsed;
  const formatter = isPlainObject(nested) ? nested : {};
  const style =
    formatter.indentStyle ?? (formatter.useTabs ? "tab" : undefined);
  if (style === "tab" || parsed.useTabs === true) {
    return IndentationText.Tab;
  }
  const width = formatter.indentWidth ?? parsed.tabWidth;
  if (style === "space" || isNumber(width)) {
    return width === 4 ? IndentationText.FourSpaces : IndentationText.TwoSpaces;
  }
  return undefined;
}

function editorconfigIndentation(rootDir: string): IndentationText | undefined {
  const editorconfig = findUpwards(rootDir, [".editorconfig"]);
  if (!editorconfig) {
    return undefined;
  }
  const settings = editorconfigSettings(fs.readFileSync(editorconfig, "utf8"));
  const style = settings.get("indent_style")?.toLowerCase();
  if (style === "tab") {
    return IndentationText.Tab;
  }
  if (style === "space") {
    return settings.get("indent_size") === "4"
      ? IndentationText.FourSpaces
      : IndentationText.TwoSpaces;
  }
  return undefined;
}

/**
 * From a Biome or Prettier config, else an `.editorconfig`, searched from
 * `rootDir` up to the repository root.
 */
export function configuredIndentation(
  rootDir: string,
): IndentationText | undefined {
  return formatterIndentation(rootDir) ?? editorconfigIndentation(rootDir);
}

/** The indentation of a file's first indented line, if it has one. */
export function sampledIndentation(text: string): IndentationText | undefined {
  const firstIndentedLine = text
    .slice(0, INDENT_SAMPLE_BYTES)
    .split("\n")
    .find((line) => /^[\t ]+\S/.test(line));
  if (!firstIndentedLine) {
    return undefined;
  }
  if (firstIndentedLine.startsWith("\t")) {
    return IndentationText.Tab;
  }
  return firstIndentedLine.startsWith("    ")
    ? IndentationText.FourSpaces
    : IndentationText.TwoSpaces;
}

function detectIndentation(rootDir: string): IndentationText {
  const configuredIndent = configuredIndentation(rootDir);
  if (configuredIndent !== undefined) {
    return configuredIndent;
  }
  const entry = path.join(rootDir, "src/index.ts");
  if (!fs.existsSync(entry)) {
    return IndentationText.Tab;
  }
  return (
    sampledIndentation(fs.readFileSync(entry, "utf8")) ?? IndentationText.Tab
  );
}

export function createProject(rootDir: string): Project {
  const manipulationSettings = {
    indentationText: detectIndentation(rootDir),
  };
  const tsConfigFilePath = findTsConfig(rootDir);
  if (tsConfigFilePath) {
    return new Project({ tsConfigFilePath, manipulationSettings });
  }
  const { options } = ts.convertCompilerOptionsFromJson(
    { ...DEFAULT_COMPILER_OPTIONS, module: CHECKER_MODULE, allowJs: true },
    rootDir,
  );
  const project = new Project({
    compilerOptions: options,
    manipulationSettings,
  });
  project.addSourceFilesAtPaths(untypedSourcePatterns(rootDir));
  return project;
}

function untypedSourcePatterns(rootDir: string): string[] {
  return [
    path.join(rootDir, "**/*.ts"),
    ...UNCHECKED_PATTERNS.map((pattern) => `!${path.join(rootDir, pattern)}`),
  ];
}

/**
 * Add the app's own sources as {@link createProject} loads them: what its
 * tsconfig includes, or every checked `.ts` file under it without one.
 */
export function addProjectSources(project: Project, rootDir: string): void {
  const tsConfigFilePath = findTsConfig(rootDir);
  if (tsConfigFilePath) {
    project.addSourceFilesFromTsConfig(tsConfigFilePath);
  } else {
    project.addSourceFilesAtPaths(untypedSourcePatterns(rootDir));
  }
}

/** The indentation a generated block should use, as a string. */
export function indentationText(rootDir: string): string {
  const detected = detectIndentation(rootDir);
  return detected === IndentationText.Tab
    ? "\t"
    : detected === IndentationText.FourSpaces
      ? "    "
      : "  ";
}

/**
 * When each of the project's own files was last written.
 *
 * An index built from a project is a parse, and a parse only describes the
 * disk it was read from. Taking this alongside one is what lets the next
 * lookup tell a file that has moved on — an editor, a formatter, a
 * `git checkout` — from one the engine wrote itself.
 */
export function stampSources(project: Project): Map<string, number> {
  const stamps = new Map<string, number>();
  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.isInNodeModules()) {
      continue;
    }
    const filepath = sourceFile.getFilePath();
    stamps.set(filepath, modifiedAt(filepath));
  }
  return stamps;
}

/** Whether any of the stamped files has been written since. */
export function sourcesChanged(stamps: Map<string, number>): boolean {
  for (const [filepath, stamped] of stamps) {
    if (modifiedAt(filepath) !== stamped) {
      return true;
    }
  }
  return false;
}

/** A file nobody can read is reported as absent rather than as an error. */
function modifiedAt(filepath: string): number {
  try {
    return fs.statSync(filepath).mtimeMs;
  } catch {
    return -1;
  }
}
