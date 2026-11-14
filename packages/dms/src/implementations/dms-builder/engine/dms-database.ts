import fs from "node:fs";
import path from "node:path";
import { Node, type ObjectLiteralExpression } from "ts-morph";
import { hasUnreadableMember, isPlainObjectLiteral } from "./literal-overrides";
import { resolveProjectRoot } from "./project";
import {
  type ConfigDraft,
  MODULES,
  objectAt,
  propertyNamed,
  refuse,
  stringOf,
} from "./project-config";
import {
  moduleEntries,
  readableConfig,
  writtenModules,
} from "./project-config-readers";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";

const DMS_DATABASE_ID = "dms-database";
const DMS_DATABASE_PACKAGE = "@antelopejs/dms-database";
const DMS_DATABASE_KEYS: ReadonlySet<string> = new Set([
  DMS_DATABASE_ID,
  DMS_DATABASE_PACKAGE,
]);

function propertyText(
  owner: ObjectLiteralExpression,
  name: string,
): string | undefined {
  return stringOf(propertyNamed(owner, name)?.getInitializer());
}

/** The `name` in the `package.json` of the folder `local`, relative to the project; nothing when it has none. */
function localPackageName(local: string): string | undefined {
  try {
    const manifest: unknown = JSON.parse(
      fs.readFileSync(
        path.resolve(resolveProjectRoot(), local, "package.json"),
        "utf8",
      ),
    );
    return isPlainObject(manifest) && isString(manifest.name)
      ? manifest.name
      : undefined;
  } catch {
    return undefined;
  }
}

function isDmsDatabaseSource(entry: ObjectLiteralExpression): boolean {
  const source = propertyNamed(entry, "source")?.getInitializer();
  if (!Node.isObjectLiteralExpression(source)) {
    return false;
  }
  const type = propertyText(source, "type");
  if (type === "package") {
    return propertyText(source, "package") === DMS_DATABASE_PACKAGE;
  }
  const local = type === "local" ? propertyText(source, "path") : undefined;
  return (
    local !== undefined && localPackageName(local) === DMS_DATABASE_PACKAGE
  );
}

/**
 * The id of the entry that is dms-database in a configuration: the module with that id, else the one
 * whose source is its package, or a local folder whose `package.json` names it. A project that adds
 * modules with `ajs project modules add` keys them by package name, so the id alone does not tell.
 * Refused when the only entry keyed as dms-database or as its package is not written as a plain
 * object literal, a version string for one: the builder cannot write to it, and a connection must
 * not go unregistered without saying so.
 */
export function dmsDatabaseIn(draft: ConfigDraft): string | undefined {
  const entries = moduleEntries(draft);
  const literal = (entries.find(([id]) => id === DMS_DATABASE_ID) ??
    entries.find(([, entry]) => isDmsDatabaseSource(entry)))?.[0];
  if (literal !== undefined) {
    return literal;
  }
  const unreadable = writtenModules(draft).find(
    ([id, entry]) => DMS_DATABASE_KEYS.has(id) && !isPlainObjectLiteral(entry),
  );
  if (unreadable) {
    refuse(
      `module "${unreadable[0]}" is not written as an object literal, so the builder cannot register a connection with dms-database there: write its entry as an object, then try again`,
    );
  }
  const modules = objectAt(draft, [MODULES]);
  if (modules && hasUnreadableMember(modules)) {
    refuse(
      "a member of the configuration's modules is written with a computed name, a method or an accessor, so the builder cannot tell whether it is dms-database, nor register a connection there: write the name of each module as plain text, then try again",
    );
  }
  return undefined;
}

/** The id of the entry that is dms-database in the project's configuration; nothing when it has none. */
export function dmsDatabaseId(): string | undefined {
  const draft = readableConfig();
  return draft && dmsDatabaseIn(draft);
}
