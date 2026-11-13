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
    if (isDmsDatabaseEntry(id, property.getInitializer())) {
      return { id, entry: property.getInitializer() };
    }
  }
  return undefined;
}

function environmentSettings(
  environments: Found,
  keys: string[],
  file: string,
): AccessSetting[] {
  if (environments === undefined) {
    return [];
  }
  if (
    environments === UNREADABLE ||
    !Node.isObjectLiteralExpression(environments)
  ) {
    return settingOf(UNREADABLE, `\`environments\` of ${file}`);
  }
  return environments.getProperties().flatMap((property) => {
    const name = Node.isPropertyAssignment(property)
      ? propertyKey(property.getNameNode())
      : property.getText();
    return settingOf(
      Node.isPropertyAssignment(property)
        ? walk(property.getInitializer(), keys)
        : UNREADABLE,
      `\`environments.${name}\` of ${file}`,
    );
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
  for (const key of ["externalConnections", connection, "access"]) {
    if (!isPlainObject(value) || !Object.hasOwn(value, key)) {
      return [];
    }
    value = value[key];
  }
  return [said(file, isString(value) ? value : JSON.stringify(value))];
}

/** The access an `envOverrides` variable set in this process writes over the config, as core applies them. */
function envOverrideSettings(
  overrides: Found,
  target: string,
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
    const reaches = paths.some(
      (written) =>
        written === undefined ||
        written === target ||
        target.startsWith(`${written}.`),
    );
    if (!reaches || value === undefined) {
      return [];
    }
    return [
      said(
        `the \`${variable}\` variable of \`envOverrides\``,
        paths.includes(target) ? value : undefined,
      ),
    ];
  });
}

function accessSettings(connection: string): AccessSetting[] {
  const configPath = findConfigFile();
  if (!configPath) {
    return [];
  }
  const file = path.basename(configPath);
  const root = configObject(new Project().addSourceFileAtPath(configPath));
  if (!root) {
    return settingOf(UNREADABLE, file);
  }
  const found = dmsDatabaseEntry(memberOf(root, "modules"));
  if (found === undefined) {
    return [];
  }
  if (found === UNREADABLE) {
    return settingOf(UNREADABLE, `\`modules\` of ${file}`);
  }
  const keys = ["config", "externalConnections", connection, "access"];
  return [
    ...settingOf(
      walk(found.entry, keys),
      `\`config.externalConnections.${connection}.access\` on the ${found.id} entry of ${file}`,
    ),
    ...environmentSettings(
      memberOf(root, "environments"),
      ["modules", found.id, ...keys],
      file,
    ),
    ...jsonSettings(found.id, connection),
    ...envOverrideSettings(
      memberOf(root, "envOverrides"),
      ["modules", found.id, ...keys].join("."),
    ),
  ];
}

/**
 * The access the project files give a connection, read on every call so a change applies without
 * a restart. It is `"read-write"` only when every place core merges into dms-database's config
 * that sets it says so: the dms-database entry, any of `environments`, `antelope.<id>.json` and
 * `envOverrides`. Anything else, an access set nowhere included, is `"read"`.
 */
export function connectionAccess(connection: string): ResolvedAccess {
  const settings = accessSettings(connection);
  const blocking = settings.find(({ writes }) => !writes);
  if (blocking) {
    return { access: "read", reason: blocking.says };
  }
  if (settings.length === 0) {
    return {
      access: "read",
      reason: `no \`config.externalConnections.${connection}.access\` on the dms-database entry of antelope.config.ts sets it, and "read" is the default`,
    };
  }
  return { access: "read-write" };
}
