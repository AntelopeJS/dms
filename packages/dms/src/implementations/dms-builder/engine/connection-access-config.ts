import fs from "node:fs";
import path from "node:path";
import { Node, Project } from "ts-morph";
import { configObject, findConfigFile, propertyKey } from "./modules";
import { stringOf } from "./project-config";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";

/**
 * What the project lets the builder do on an external connection: write, or only read, with the
 * place in the project files that keeps it from writing.
 */
export type ResolvedAccess =
  | { access: "read-write" }
  | { access: "read"; reason: string };

/** One place of the project files that sets a connection's access, and what it says there. */
interface AccessSetting {
  writes: boolean;
  /** What this place says, completing "… is read-only, since …". */
  says: string;
}

function said(where: string, value: string | undefined): AccessSetting {
  return {
    writes: value === "read-write",
    says:
      value === undefined
        ? `the builder cannot read ${where} as a literal`
        : `${where} sets it to ${JSON.stringify(value)}`,
  };
}

const DMS_DATABASE_ID = "dms-database";
const DMS_DATABASE_PACKAGE = "@antelopejs/dms-database";

/** A member a spread, a shorthand or a computed name may hide, so the value cannot be read. */
const UNREADABLE = Symbol("unreadable");
type Found = Node | undefined | typeof UNREADABLE;

function memberOf(node: Found, key: string): Found {
  if (node === undefined || node === UNREADABLE) {
    return node;
  }
  if (!Node.isObjectLiteralExpression(node)) {
    return UNREADABLE;
  }
  let found: Found;
  for (const property of node.getProperties()) {
    if (Node.isPropertyAssignment(property)) {
      const name = property.getNameNode();
      if (Node.isComputedPropertyName(name)) {
        found = UNREADABLE;
      } else if (propertyKey(name) === key) {
        found = property.getInitializer();
      }
    } else if (
      Node.isSpreadAssignment(property) ||
      (Node.isShorthandPropertyAssignment(property) &&
        property.getName() === key)
    ) {
      found = UNREADABLE;
    }
  }
  return found;
}

function walk(start: Found, keys: string[]): Found {
  return keys.reduce(memberOf, start);
}

function literal(found: Found): string | undefined {
  return found === UNREADABLE ? undefined : stringOf(found);
}

function settingOf(found: Found, where: string): AccessSetting[] {
  return found === undefined ? [] : [said(where, literal(found))];
}

function isDmsDatabaseEntry(id: string, entry: Node | undefined): boolean {
  return (
    id === DMS_DATABASE_ID ||
    id === DMS_DATABASE_PACKAGE ||
    literal(walk(entry, ["source", "package"])) === DMS_DATABASE_PACKAGE
  );
}

/** The dms-database entry's id and value, or what keeps it from being read. */
function dmsDatabaseEntry(
  modules: Found,
): { id: string; entry: Found } | typeof UNREADABLE | undefined {
  if (modules === undefined || modules === UNREADABLE) {
    return modules;
  }
  if (
    !Node.isObjectLiteralExpression(modules) ||
    modules.getProperties().some(Node.isSpreadAssignment)
  ) {
    return UNREADABLE;
  }
  for (const property of modules.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }
    const id = propertyKey(property.getNameNode());
    const entry = property.getInitializer();
    if (!isDmsDatabaseEntry(id, entry)) {
      continue;
    }
    const disabled = memberOf(entry, "disabled");
    if (disabled === UNREADABLE) {
      return UNREADABLE;
    }
    if (disabled === undefined || Node.isFalseLiteral(disabled)) {
      return { id, entry };
    }
    if (!Node.isTrueLiteral(disabled)) {
      return UNREADABLE;
    }
  }
  return undefined;
}

/** What one member of `environments` merges over the base: the access, and `envOverrides`. */
interface EnvironmentLayer {
  name: string;
  sets?: AccessSetting;
  overrides: AccessSetting[];
}

function environmentLayers(
  environments: Found,
  keys: string[],
  file: string,
): EnvironmentLayer[] {
  if (environments === undefined) {
    return [];
  }
  if (
    environments === UNREADABLE ||
    !Node.isObjectLiteralExpression(environments)
  ) {
    return [
      {
        name: "*",
        sets: said(`\`environments\` of ${file}`, undefined),
        overrides: [],
      },
    ];
  }
  return environments.getProperties().map((property) => {
    const name = Node.isPropertyAssignment(property)
      ? propertyKey(property.getNameNode())
      : property.getText();
    const member = Node.isPropertyAssignment(property)
      ? property.getInitializer()
      : UNREADABLE;
    const [sets] = settingOf(
      walk(member, keys),
      `\`environments.${name}\` of ${file}`,
    );
    return {
      name,
      sets,
      overrides: envOverrideSettings(memberOf(member, "envOverrides"), keys),
    };
  });
}

/** The access a module's `antelope.<id>.json`, which core merges over its config, sets. */
function jsonSettings(id: string, connection: string): AccessSetting[] {
  const file = `antelope.${id}.json`;
  const filePath = path.join(path.dirname(findConfigFile() ?? ""), file);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [said(file, undefined)];
  }
  if (!isPlainObject(value)) {
    return [];
  }
  for (const key of ["externalConnections", connection, "access"]) {
    if (!isPlainObject(value)) {
      return [
        {
          writes: false,
          says: `${file} replaces \`externalConnections.${connection}\` with something that holds no \`access\``,
        },
      ];
    }
    if (!Object.hasOwn(value, key)) {
      return [];
    }
    value = value[key];
  }
  return [said(file, isString(value) ? value : JSON.stringify(value))];
}

/** The access an `envOverrides` variable set in this process writes over the config, as core applies them. */
/**
 * Where an `envOverrides` path writes, relative to the access: core splits the path on dots, so a
 * path reaches it only as the same segments or a prefix of them, never through an id with a dot.
 */
function reach(
  written: string,
  target: string[],
): "exact" | "above" | undefined {
  const segments = written.split(".");
  if (segments.some((segment, index) => segment !== target[index])) {
    return undefined;
  }
  return segments.length === target.length ? "exact" : "above";
}

function envOverrideSettings(
  overrides: Found,
  target: string[],
): AccessSetting[] {
  if (overrides === undefined) {
    return [];
  }
  if (overrides === UNREADABLE || !Node.isObjectLiteralExpression(overrides)) {
    return settingOf(UNREADABLE, "`envOverrides`");
  }
  return overrides.getProperties().flatMap((property) => {
    if (!Node.isPropertyAssignment(property)) {
      return settingOf(UNREADABLE, "`envOverrides`");
    }
    const variable = propertyKey(property.getNameNode());
    const value = process.env[variable];
    const initializer = property.getInitializer();
    const paths = Node.isArrayLiteralExpression(initializer)
      ? initializer.getElements().map(stringOf)
      : [stringOf(initializer)];
    const reaches = paths.map((written) =>
      written === undefined ? "above" : reach(written, target),
    );
    if (reaches.every((found) => found === undefined) || value === undefined) {
      return [];
    }
    return [
      said(
        `the \`${variable}\` variable of \`envOverrides\``,
        reaches.every((found) => found !== "above") ? value : undefined,
      ),
    ];
  });
}

/**
 * The places core merges into dms-database's config that set the access, in its order: the
 * entry, one of `environments` (the launch environment, which the builder cannot know, so each in
 * turn), then `antelope.<id>.json` and `envOverrides`, where the last one wins.
 */
interface AccessLayers {
  base: AccessSetting[];
  environments: EnvironmentLayer[];
  json: AccessSetting[];
  overrides: AccessSetting[];
}

function accessLayers(connection: string): AccessLayers | AccessSetting {
  const configPath = findConfigFile();
  const empty: AccessLayers = {
    base: [],
    environments: [],
    json: [],
    overrides: [],
  };
  if (!configPath) {
    return empty;
  }
  const file = path.basename(configPath);
  const root = configObject(new Project().addSourceFileAtPath(configPath));
  if (!root) {
    return said(file, undefined);
  }
  const found = dmsDatabaseEntry(memberOf(root, "modules"));
  if (found === undefined) {
    return empty;
  }
  if (found === UNREADABLE) {
    return said(`\`modules\` of ${file}`, undefined);
  }
  const keys = ["config", "externalConnections", connection, "access"];
  return {
    base: settingOf(
      walk(found.entry, keys),
      `\`config.externalConnections.${connection}.access\` on the ${found.id} entry of ${file}`,
    ),
    environments: environmentLayers(
      memberOf(root, "environments"),
      ["modules", found.id, ...keys],
      file,
    ),
    json: jsonSettings(found.id, connection),
    overrides: envOverrideSettings(memberOf(root, "envOverrides"), [
      "modules",
      found.id,
      ...keys,
    ]),
  };
}

let launchEnvironment: string | undefined;

/**
 * Records the environment core launched the project with, so the access is resolved for it alone.
 * Until then, every member of `environments` counts.
 *
 * @param environment `GetRuntimeInfo().env`
 */
export function recordLaunchEnvironment(environment: string | undefined): void {
  launchEnvironment = environment;
}

/** The environments the access may be resolved for: the launch one, or each, and none. */
function candidates(layers: AccessLayers): (EnvironmentLayer | undefined)[] {
  if (launchEnvironment === undefined) {
    return [undefined, ...layers.environments];
  }
  return [
    layers.environments.find(
      ({ name }) => name === launchEnvironment || name === "*",
    ),
  ];
}

/**
 * The access the project files give a connection, read on every call so a change applies without
 * a restart. Core merges the dms-database entry, the launch environment's member of
 * `environments`, `antelope.<id>.json`, then `envOverrides` with the environment's own, the last
 * that sets the access winning. The access is `"read-write"` only when that merge says so for the
 * launch environment, or, before it is recorded, for no environment and for each one. Anything
 * else, an access set nowhere included, is `"read"`.
 */
export function connectionAccess(connection: string): ResolvedAccess {
  const layers = accessLayers(connection);
  if (!("base" in layers)) {
    return { access: "read", reason: layers.says };
  }
  for (const environment of candidates(layers)) {
    const winning = [
      ...layers.base,
      ...(environment?.sets ? [environment.sets] : []),
      ...layers.json,
      ...layers.overrides,
      ...(environment?.overrides ?? []),
    ].at(-1);
    if (!winning) {
      return {
        access: "read",
        reason: `no \`config.externalConnections.${connection}.access\` on the dms-database entry of antelope.config.ts sets it, and "read" is the default`,
      };
    }
    if (!winning.writes) {
      return { access: "read", reason: winning.says };
    }
  }
  return { access: "read-write" };
}
