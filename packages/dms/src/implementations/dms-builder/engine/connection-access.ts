import type {
  AddBlockInput,
  MapResourcesInput,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { Node } from "ts-morph";
import type { BlockTarget } from "./block-target";
import { connectionAccess } from "./connection-access-config";
import { mappedConnectionOfFile, recordedConnection } from "./mapped-modules";
import { RoutesOf } from "./mapped-routes";
import { targetModule } from "./modules";
import { stringOf } from "./project-config";
import {
  findResourceBySymbol,
  findResourceRecord,
  type ResourceRecord,
} from "./resource-index";
import { InvalidValueError } from "./value";

const RESOURCE_FORM = "ResourceForm";
const WRITE_ROUTES: ReadonlySet<ResourceRoute> = new Set([
  "create",
  "edit",
  "delete",
  "archive",
]);

/**
 * Why a write on a connection is refused, naming the connection, what keeps it read-only and how
 * a person allows changes, or nothing when its access is `"read-write"`.
 *
 * @param connection The connection id
 * @param attempt What was asked, completing "refused to …"
 */
function readOnlyRefusal(
  connection: string,
  attempt: string,
): string | undefined {
  const resolved = connectionAccess(connection);
  if (resolved.access === "read-write") {
    return undefined;
  }
  return `refused to ${attempt}: connection "${connection}" is read-only, since ${resolved.reason}. Ask the person to allow changes: the Read & write switch at the top of the Database module's Data browser, or \`access: "read-write"\` under \`config.externalConnections.${connection}\` on the dms-database entry of antelope.config.ts.`;
}

/** The connection a module's record names, when the builder mapped tables into it. */
function boundConnection(module: string): string | undefined {
  const root = targetModule(module)?.root;
  return root === undefined ? undefined : recordedConnection(root);
}

/**
 * Why a mapping is refused because it serves create, edit and delete routes on a read-only
 * connection, the one named or the one the module is bound to, or nothing when it serves none or
 * both allow writes.
 */
export function writableMappingRefusal({
  module,
  connection,
  resources,
}: Pick<MapResourcesInput, "module" | "connection" | "resources">):
  | string
  | undefined {
  const served = resources.flatMap((resource) =>
    RoutesOf(resource) === undefined ? [resource.relation] : [],
  );
  if (served.length === 0) {
    return undefined;
  }
  const attempt = `map ${served.join(", ")} with \`writable: true\``;
  const refusal = [...new Set([connection, boundConnection(module)])]
    .flatMap((candidate) =>
      candidate === undefined ? [] : [readOnlyRefusal(candidate, attempt)],
    )
    .find((found) => found !== undefined);
  return refusal && `${refusal} Until then, map them with \`writable: false\`.`;
}

/**
 * Why routes are refused on a resource because they write to a table mapped from a read-only
 * connection, or nothing when they only read or the connection allows writes.
 */
export function writeRoutesRefusal(
  record: ResourceRecord,
  routes: readonly ResourceRoute[],
): string | undefined {
  const writes = routes.filter((route) => WRITE_ROUTES.has(route));
  const connection = mappedConnectionOfFile(record.databaseFile);
  return writes.length === 0 || connection === undefined
    ? undefined
    : readOnlyRefusal(
        connection,
        `serve the ${writes.join(", ")} routes on "${record.ref}"`,
      );
}

const ROW_WRITING_FORMS = [
  { mode: "new", verb: "creates" },
  { mode: "edit", verb: "edits" },
] as const;

/** A block refused because it would write rows of a table mapped from a read-only connection. */
class ReadOnlyConnectionError extends InvalidValueError {}

function servesWrites(record: ResourceRecord): boolean {
  return (
    record.routes === undefined ||
    record.routes.some((route) => WRITE_ROUTES.has(route))
  );
}

type RowWritingForm = (typeof ROW_WRITING_FORMS)[number];

function rowWritingForm(mode: string | undefined): RowWritingForm | undefined {
  return ROW_WRITING_FORMS.find((form) => form.mode === mode);
}

/** What a block bound to a resource asks to write, completing "refused to …", if anything. */
function writingAttempt(
  type: string,
  record: ResourceRecord,
  form: RowWritingForm | undefined,
): string | undefined {
  if (type === RESOURCE_FORM) {
    return form && `add a form that ${form.verb} rows of "${record.ref}"`;
  }
  return servesWrites(record)
    ? `add a ${type} over "${record.ref}", whose table still serves create, edit and delete routes; map it again with \`writable: false\` to show it read-only`
    : undefined;
}

function assertBound(
  type: string,
  controller: string | undefined,
  form: RowWritingForm | undefined,
): void {
  const record =
    controller === undefined ? undefined : findResourceRecord(controller);
  if (!record) {
    return;
  }
  const connection = mappedConnectionOfFile(record.databaseFile);
  const attempt = writingAttempt(type, record, form);
  const refusal =
    connection === undefined || attempt === undefined
      ? undefined
      : readOnlyRefusal(connection, attempt);
  if (refusal) {
    throw new ReadOnlyConnectionError(refusal);
  }
}

/**
 * Throws for a new block over a table mapped from a read-only connection that would write to it:
 * a form that creates or edits its rows, or a block over a table that still serves write routes.
 */
export function assertBlockAccess({
  type,
  controller,
  config,
}: Pick<AddBlockInput, "type" | "controller" | "config">): void {
  const mode = config.mode;
  assertBound(
    type,
    controller,
    ROW_WRITING_FORMS.find((form) => form.mode === mode),
  );
}

/**
 * Throws for a form already on a page, read from its call as it stands after a patch, that now
 * creates or edits rows of a table mapped from a read-only connection.
 */
export function assertFormAccess({
  type,
  controllerArg,
  factoryCall,
}: BlockTarget): void {
  if (type !== RESOURCE_FORM || !controllerArg) {
    return;
  }
  const [controllerNode, options] = factoryCall.getArguments();
  const property = Node.isObjectLiteralExpression(options)
    ? options.getProperty("mode")
    : undefined;
  const mode = Node.isPropertyAssignment(property)
    ? stringOf(property.getInitializer())
    : undefined;
  assertBound(
    type,
    Node.isIdentifier(controllerNode)
      ? findResourceBySymbol(controllerNode.getText())?.ref
      : undefined,
    rowWritingForm(mode),
  );
}
