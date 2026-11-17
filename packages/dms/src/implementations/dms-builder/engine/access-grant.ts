import type {
  ConfigObject,
  ConfigValue,
  ModuleEntryInput,
  ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { z } from "zod";
import { hasUnreadableMember } from "./literal-overrides";
import { findConfigFile, propertyKey } from "./modules";
import { resolveProjectRoot } from "./project";
import {
  type ConfigDraft,
  ENV_OVERRIDES,
  MODULES,
  objectAt,
  openDraft,
  stringOf,
} from "./project-config";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";

const CONNECTIONS = "externalConnections";
const ACCESS_PATH = /(^|\.)config\.externalConnections(\.|$)/;
const UNREADABLE = "unreadable";

function grantRefusal(subject: string): string {
  return `refused to ${subject}: an agent never raises a connection's access. A person grants it: the Read & write switch at the top of the Database module's Data browser (dms-database's \`PUT /api/database/connections/<id>/access\`), or the assistant's connect step (dms-assistant's \`POST /database/project\`).`;
}

/** The values an access may be written as; anything else is refused. */
const WrittenAccessSchema = z
  .union([z.literal("read"), z.literal("read-write"), z.null()])
  .optional();

/** The configuration as written, or nothing when it cannot be read as a literal. */
function readDraft(): ConfigDraft | undefined {
  const configPath = findConfigFile();
  if (configPath === undefined) {
    return undefined;
  }
  try {
    return openDraft(configPath);
  } catch {
    return undefined;
  }
}

/**
 * The object literal at `path`: absent, or unreadable when it, or an object along the way, is not
 * a plain literal or holds a member under a name the builder cannot read, which may be the key.
 */
function literalAt(
  draft: ConfigDraft | undefined,
  path: string[],
): ObjectLiteralExpression | undefined | typeof UNREADABLE {
  if (!draft) {
    return UNREADABLE;
  }
  try {
    for (const depth of path.keys()) {
      const along = objectAt(draft, path.slice(0, depth));
      if (along && hasUnreadableMember(along)) {
        return UNREADABLE;
      }
    }
    return objectAt(draft, path);
  } catch {
    return UNREADABLE;
  }
}

/**
 * Whether the module's base entry in `antelope.config.ts` holds the connection's access as the
 * literal `"read-write"`. An expression, a variable, a template or an absent node does not
 * count, whatever it resolves to.
 */
function holdsReadWrite(
  draft: ConfigDraft | undefined,
  module: string,
  connection: string,
): boolean {
  const setting = literalAt(draft, [
    MODULES,
    module,
    "config",
    CONNECTIONS,
    connection,
  ]);
  if (setting === undefined || setting === UNREADABLE) {
    return false;
  }
  const properties = setting.getProperties();
  if (
    properties.some(
      (property) =>
        !Node.isPropertyAssignment(property) ||
        Node.isComputedPropertyName(property.getNameNode()),
    )
  ) {
    return false;
  }
  const access = properties
    .filter(Node.isPropertyAssignment)
    .findLast((property) => propertyKey(property.getNameNode()) === "access")
    ?.getInitializer();
  return stringOf(access) === "read-write";
}

/**
 * Whether `envOverrides` maps the variable to a connection's access, in any form; an
 * `envOverrides` that is not a plain literal may, so it counts.
 */
function mapsToAccess(
  draft: ConfigDraft | undefined,
  variable: string,
): boolean {
  const overrides = literalAt(draft, [ENV_OVERRIDES]);
  if (overrides === undefined) {
    return false;
  }
  if (overrides === UNREADABLE) {
    return true;
  }
  return overrides.getProperties().some((property) => {
    if (!Node.isPropertyAssignment(property)) {
      return true;
    }
    if (propertyKey(property.getNameNode()) !== variable) {
      return false;
    }
    const initializer = property.getInitializer();
    const paths = Node.isArrayLiteralExpression(initializer)
      ? initializer.getElements().map(stringOf)
      : [stringOf(initializer)];
    return paths.some((path) => path === undefined || ACCESS_PATH.test(path));
  });
}

/** Why an entry's `config` is refused because it would raise a connection's access, or nothing. */
function raisedByConfig(
  draft: ConfigDraft | undefined,
  module: string,
  entry: ModuleEntryInput,
): string | undefined {
  const connections = entry.config?.[CONNECTIONS];
  if (connections === undefined || connections === null) {
    return undefined;
  }
  if (!isPlainObject(connections)) {
    return grantRefusal(
      `replace \`config.${CONNECTIONS}\` with ${JSON.stringify(connections)}`,
    );
  }
  for (const [connection, setting] of Object.entries(connections)) {
    if (setting === undefined || setting === null) {
      continue;
    }
    const access = isPlainObject(setting) ? setting.access : setting;
    const written = WrittenAccessSchema.safeParse(access);
    if (
      !isPlainObject(setting) ||
      !written.success ||
      (written.data === "read-write" &&
        !holdsReadWrite(draft, module, connection))
    ) {
      return grantRefusal(
        `set the access of connection "${connection}" to ${JSON.stringify(access)}`,
      );
    }
  }
  return undefined;
}

/** Why an entry's `env` is refused because a variable would supply or rebind an access. */
function raisedByEnv(
  draft: ConfigDraft | undefined,
  entry: ModuleEntryInput,
): string | undefined {
  for (const [configPath, variable] of Object.entries(entry.env ?? {})) {
    if (
      configPath === CONNECTIONS ||
      configPath.startsWith(`${CONNECTIONS}.`)
    ) {
      return grantRefusal(`supply \`config.${configPath}\` from a variable`);
    }
    if (mapsToAccess(draft, variable)) {
      return grantRefusal(
        `rebind \`${variable}\`, which \`envOverrides\` maps to a connection's access`,
      );
    }
  }
  return undefined;
}

const TEMPLATE = /\$\{([^}]+)\}/g;
const MODULE_CONFIG_FILE = /^antelope\..+\.json$/;
const MODULE_CONFIG_DIRECTORY = /^antelope\./;
const JSON_FILE = /\.json$/;
const ANY = /(?:)/;
const CONFIG_VARIABLE = "@";

function textOf(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function isDirectory(at: string): boolean {
  try {
    return statSync(at).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The files under `directory` whose name `kept` matches, and every JSON file in the directories
 * `entered` matches, at any depth. Symbolic links are followed, as core follows them, and each
 * directory is read once.
 */
function filesIn(
  directory: string,
  kept: RegExp,
  entered: RegExp,
  seen: Set<string>,
): string[] {
  let names: string[];
  try {
    const real = realpathSync(directory);
    if (seen.has(real)) {
      return [];
    }
    seen.add(real);
    names = readdirSync(directory);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const at = path.join(directory, name);
    if (isDirectory(at)) {
      return entered.test(name) ? filesIn(at, JSON_FILE, ANY, seen) : [];
    }
    return kept.test(name) ? [at] : [];
  });
}

/**
 * The `antelope.<id>.json` files core may merge into a module: `<id>` may hold a `/`, as a scoped
 * package name does, which puts the file under an `antelope.<scope>` directory.
 */
function moduleConfigFiles(root: string): string[] {
  return filesIn(root, MODULE_CONFIG_FILE, MODULE_CONFIG_DIRECTORY, new Set());
}

/** The keys and string values of a JSON file as core parses it, or its text when it is not JSON. */
function jsonStrings(file: string): string[] {
  const text = textOf(file);
  const strings: string[] = [];
  try {
    JSON.parse(text, (key: string, value: ConfigValue) => {
      strings.push(key);
      if (isString(value)) {
        strings.push(value);
      }
      return value;
    });
  } catch {
    return [text];
  }
  return strings;
}

/**
 * The strings antelope.config.ts holds, where a core template can sit. A TypeScript template
 * literal's `${…}` is resolved before core reads the value, so only its literal text counts. A
 * configuration that cannot be parsed counts whole.
 */
function configStrings(
  draft: ConfigDraft | undefined,
  configPath: string,
): string[] {
  if (!draft) {
    return [textOf(configPath)];
  }
  return draft.file.getDescendants().flatMap((node) => {
    if (
      Node.isStringLiteral(node) ||
      Node.isNoSubstitutionTemplateLiteral(node)
    ) {
      return [node.getLiteralValue()];
    }
    return Node.isTemplateHead(node) ||
      Node.isTemplateMiddle(node) ||
      Node.isTemplateTail(node)
      ? [node.getLiteralText()]
      : [];
  });
}

/**
 * The keys the `${key}` templates of antelope.config.ts and the project's antelope.<id>.json files
 * read. Core resolves them after `envOverrides`, by a key's full path or by a key's own name, from
 * any module, so a template on one connection's access may read a key written anywhere.
 */
function templateKeys(draft: ConfigDraft | undefined): Set<string> {
  const configPath = findConfigFile();
  if (configPath === undefined) {
    return new Set();
  }
  const texts = [
    ...configStrings(draft, configPath),
    ...moduleConfigFiles(resolveProjectRoot()).flatMap(jsonStrings),
  ];
  return new Set(
    texts
      .flatMap((text) => [...text.matchAll(TEMPLATE)])
      .map(([, key]) => key)
      .filter((key) => !key.startsWith(CONFIG_VARIABLE)),
  );
}

/** A key a step writes: its full path, and its own name as written, which may hold dots. */
interface WrittenKey {
  path: string;
  key: string;
}

/** Every key a value writes below `prefix`, at any depth. */
function writtenKeys(prefix: string, value: ConfigValue): WrittenKey[] {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const path = `${prefix}.${key}`;
    return [{ path, key }, ...writtenKeys(path, child)];
  });
}

/** The key an `env` binding sets: core splits its config path on dots. */
function boundKey(entryPath: string, configPath: string): WrittenKey {
  return {
    path: `${entryPath}.config.${configPath}`,
    key: configPath.slice(configPath.lastIndexOf(".") + 1),
  };
}

/** Why an entry is refused because it writes or binds a key a template reads, or nothing. */
function readByTemplate(
  keys: ReadonlySet<string>,
  module: string,
  { env, importOverrides, ...values }: ModuleEntryInput,
): string | undefined {
  if (keys.size === 0) {
    return undefined;
  }
  const written: ConfigObject = {
    ...values,
    importOverrides: importOverrides?.map((override) => ({ ...override })),
  };
  const entryPath = `${MODULES}.${module}`;
  const read = [
    ...writtenKeys(entryPath, written),
    ...Object.keys(env ?? {}).map((configPath) =>
      boundKey(entryPath, configPath),
    ),
  ].find(({ path, key }) => keys.has(path) || keys.has(key))?.path;
  return (
    read &&
    grantRefusal(
      `write \`${read}\`, which a \`\${…}\` template in the configuration reads and may make a connection's access`,
    )
  );
}

/**
 * Why an agent's configuration steps are refused because one would raise a connection's access:
 * set `config.externalConnections.<id>.access` to `"read-write"` where the module's base entry in
 * `antelope.config.ts` does not already hold that literal, write anything else but `"read"`
 * there, let a variable supply it, rebind a variable `envOverrides` maps to it, or write or bind a
 * key a `${key}` template reads, which may make an access. Keeping,
 * lowering or removing an access passes, so a step may restate the connections it does not
 * change. Every MCP tool that writes project or module configuration calls this first; the
 * builder interface does not, since owner-authenticated routes grant through it.
 */
export function raisedAccessRefusal(
  steps: readonly ProjectConfigStep[],
): string | undefined {
  const draft = readDraft();
  const keys = templateKeys(draft);
  for (const step of steps) {
    const entry =
      step.op === "RemoveModule" || step.op === "RemoveConnection"
        ? undefined
        : step.entry;
    const refusal =
      entry &&
      (raisedByConfig(draft, step.id, entry) ??
        raisedByEnv(draft, entry) ??
        readByTemplate(keys, step.id, entry));
    if (refusal) {
      return refusal;
    }
  }
  return undefined;
}
