import type {
  AddBlockInput,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import { Node, type ObjectLiteralExpression, Project } from "ts-morph";
import type { BlockTarget } from "./block-target";
import { mappedConnectionOfFile } from "./mapped-modules";
import { configObject, findConfigFile, propertyKey } from "./modules";
import { stringOf } from "./project-config";
import { findResourceBySymbol, findResourceRecord } from "./resource-index";
import { InvalidValueError } from "./value";

/** What the project lets the DMS do on an external connection, as dms-database reads it. */
type ConnectionAccess = "read" | "read-write";

const DMS_DATABASE_ID = "dms-database";
const DMS_DATABASE_PACKAGE = "@antelopejs/dms-database";
const RESOURCE_FORM = "ResourceForm";

/**
 * The value under `key` in an object literal, as the module loader would read it: the last
 * assignment of that name. A spread may hide the key, so an object holding one answers nothing.
 */
function memberOf(node: Node | undefined, key: string): Node | undefined {
  if (
    !Node.isObjectLiteralExpression(node) ||
    node.getProperties().some(Node.isSpreadAssignment)
  ) {
    return undefined;
  }
  return node
    .getProperties()
    .filter(Node.isPropertyAssignment)
    .findLast((property) => propertyKey(property.getNameNode()) === key)
    ?.getInitializer();
}

function isDmsDatabaseEntry(id: string, entry: Node | undefined): boolean {
  return (
    id === DMS_DATABASE_ID ||
    stringOf(memberOf(memberOf(entry, "source"), "package")) ===
      DMS_DATABASE_PACKAGE
  );
}

function dmsDatabaseEntry(modules: ObjectLiteralExpression): Node | undefined {
  return modules
    .getProperties()
    .filter(Node.isPropertyAssignment)
    .find((property) =>
      isDmsDatabaseEntry(
        propertyKey(property.getNameNode()),
        property.getInitializer(),
      ),
    )
    ?.getInitializer();
}

/**
 * The access `antelope.config.ts` gives a connection: `config.externalConnections.<id>.access` on
 * the dms-database entry, read on every call so a change applies without a restart. Anything but
 * a literal `"read-write"` there, an absent entry included, is `"read"`.
 */
function connectionAccess(connection: string): ConnectionAccess {
  const configPath = findConfigFile();
  if (!configPath) {
    return "read";
  }
  const config = configObject(new Project().addSourceFileAtPath(configPath));
  const modules = config && memberOf(config, "modules");
  if (!Node.isObjectLiteralExpression(modules)) {
    return "read";
  }
  const access = ["config", "externalConnections", connection, "access"].reduce<
    Node | undefined
  >(memberOf, dmsDatabaseEntry(modules));
  return stringOf(access) === "read-write" ? "read-write" : "read";
}

/**
 * Why a write on a connection is refused, naming the connection and how a person allows it, or
 * nothing when its access is `"read-write"`.
 *
 * @param connection The connection id
 * @param attempt What was asked, completing "refused to …"
 */
function readOnlyRefusal(
  connection: string,
  attempt: string,
): string | undefined {
  if (connectionAccess(connection) === "read-write") {
    return undefined;
  }
  return `refused to ${attempt}: connection "${connection}" is read-only. Its access is "read" (\`config.externalConnections.${connection}.access\` on the dms-database entry of antelope.config.ts, "read" when absent). Ask the person to allow changes: the Read & write switch at the top of the Database module's Data browser, or \`access: "read-write"\` there in antelope.config.ts.`;
}

/**
 * Why a mapping is refused because it serves create, edit and delete routes on a read-only
 * connection, or nothing when it maps every relation read-only or the connection allows writes.
 */
export function writableMappingRefusal({
  connection,
  resources,
}: Pick<MapResourcesInput, "connection" | "resources">): string | undefined {
  const writable = resources.flatMap(({ relation, writable }) =>
    writable ? [relation] : [],
  );
  if (writable.length === 0) {
    return undefined;
  }
  const refusal = readOnlyRefusal(
    connection,
    `map ${writable.join(", ")} with \`writable: true\``,
  );
  return refusal && `${refusal} Until then, map them with \`writable: false\`.`;
}

const ROW_WRITING_FORMS = [
  { mode: "new", verb: "creates" },
  { mode: "edit", verb: "edits" },
] as const;

/** A form refused because it would write rows of a table mapped from a read-only connection. */
class ReadOnlyConnectionError extends InvalidValueError {}

/**
 * Throws {@link ReadOnlyConnectionError} for a form that creates or edits rows of a table mapped
 * from a read-only connection. Any other block passes.
 */
export function assertFormAccess({
  type,
  controller,
  config,
}: Pick<AddBlockInput, "type" | "controller" | "config">): void {
  const form = ROW_WRITING_FORMS.find(({ mode }) => mode === config.mode);
  if (type !== RESOURCE_FORM || controller === undefined || !form) {
    return;
  }
  const record = findResourceRecord(controller);
  const connection = record && mappedConnectionOfFile(record.databaseFile);
  const refusal =
    connection === undefined
      ? undefined
      : readOnlyRefusal(
          connection,
          `add a form that ${form.verb} rows of "${controller}"`,
        );
  if (refusal) {
    throw new ReadOnlyConnectionError(refusal);
  }
}

/**
 * {@link assertFormAccess} for a block already on a page, read from its call as it stands, so a
 * patch that turns a read-only form into one that writes is refused.
 */
export function assertBlockAccess({
  type,
  controllerArg,
  factoryCall,
}: BlockTarget): void {
  if (type === undefined || !controllerArg) {
    return;
  }
  const [controllerNode, options] = factoryCall.getArguments();
  const mode = stringOf(memberOf(options, "mode"));
  assertFormAccess({
    type,
    controller: Node.isIdentifier(controllerNode)
      ? findResourceBySymbol(controllerNode.getText())?.ref
      : undefined,
    config: mode === undefined ? {} : { mode },
  });
}
