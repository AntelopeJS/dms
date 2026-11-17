import type {
  AddBlockInput,
  BlockDraft,
  MapResourcesInput,
  PageDraft,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { type ClassDeclaration, Node } from "ts-morph";
import { type BlockTarget, resolveBlockTarget } from "./block-target";
import { connectionAccess } from "./connection-access-config";
import { mappedConnectionOfFile, recordedConnection } from "./mapped-modules";
import { RoutesOf } from "./mapped-routes";
import { targetModule } from "./modules";
import { objectLiteralToValue } from "./config-literal";
import type { LiteralValue } from "./guards";
import { isString } from "./scalar-guards";
import {
  findResourceRecord,
  listResourceRecords,
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
  switch (resolved.cause) {
    case "configured":
      return `refused to ${attempt}: connection "${connection}" is read-only, since ${resolved.reason}. Ask the person to allow changes: the Read & write switch at the top of the Database module's Data browser, or \`access: "read-write"\` under \`config.externalConnections.${connection}\` on the dms-database entry of antelope.config.ts.`;
    case "unresolved":
      return `refused to ${attempt}: the access of connection "${connection}" could not be checked, since ${resolved.reason}. Fix antelope.config.ts so core can load it, then try again.`;
    case "core-missing":
      return `refused to ${attempt}: the access of connection "${connection}" could not be checked, since ${resolved.reason}. Install @antelopejs/core in the project, then try again.`;
  }
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

interface RowWritingForm {
  verb: string;
}

/** A mode the builder cannot read as `"new"`, `"edit"` or `"view"` may be either writing mode. */
const UNREAD_MODE: RowWritingForm = { verb: "may create or edit" };

/** The rows a ResourceForm in this mode writes: none for `"view"` or no mode, any for a mode it cannot read. */
function rowWritingForm(mode: string | undefined): RowWritingForm | undefined {
  if (mode === undefined || mode === "view") {
    return undefined;
  }
  return ROW_WRITING_FORMS.find((form) => form.mode === mode) ?? UNREAD_MODE;
}

/** A mode as text: the string it is, or the JSON of a value that is not one, such as `{ $expr }`. */
function modeText(mode: LiteralValue | undefined): string | undefined {
  return isString(mode) ? mode : JSON.stringify(mode);
}

/** What a block bound to a resource asks to write, completing "refused to …", if anything. */
function writingAttempt(
  type: string,
  record: ResourceRecord,
  form: RowWritingForm | undefined,
  added: boolean,
): string | undefined {
  if (type === RESOURCE_FORM) {
    const what = added ? "add a form" : "turn a form into one";
    return form && `${what} that ${form.verb} rows of "${record.ref}"`;
  }
  return servesWrites(record)
    ? `add a ${type} over "${record.ref}", whose table still serves create, edit and delete routes; map it again with \`writable: false\` to show it read-only`
    : undefined;
}

/** Why a block bound to a resource is refused on a read-only connection, or nothing. */
function boundRefusal(
  type: string,
  record: ResourceRecord,
  form: RowWritingForm | undefined,
  added: boolean,
): string | undefined {
  const connection = mappedConnectionOfFile(record.databaseFile);
  const attempt = writingAttempt(type, record, form, added);
  return connection === undefined || attempt === undefined
    ? undefined
    : readOnlyRefusal(connection, attempt);
}

function assertBound(
  type: string,
  record: ResourceRecord | undefined,
  form: RowWritingForm | undefined,
  added = true,
): void {
  const refusal = record && boundRefusal(type, record, form, added);
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
  assertBound(
    type,
    controller === undefined ? undefined : findResourceRecord(controller),
    rowWritingForm(modeText(config.mode)),
  );
}

/**
 * A ResourceForm's mode as the page reader reads its call, named constants resolved, as text; the
 * text of the whole options when they are not an object literal; nothing for another block.
 */
function formMode({
  type,
  controllerArg,
  factoryCall,
}: BlockTarget): string | undefined {
  const options = factoryCall.getArguments()[1];
  if (type !== RESOURCE_FORM || !controllerArg || options === undefined) {
    return undefined;
  }
  const { value } = objectLiteralToValue(options);
  return modeText(Object.hasOwn(value, "$expr") ? value : value.mode);
}

function assertFormAccess(
  target: BlockTarget,
  before: string | undefined,
): void {
  const after = formMode(target);
  const controllerNode = target.factoryCall.getArguments()[0];
  if (after === before || target.type === undefined) {
    return;
  }
  for (const record of controllerRecords(controllerNode)) {
    assertBound(target.type, record, rowWritingForm(after), false);
  }
}

/**
 * The resources a block's controller argument may be: the one whose DataAPI file its import names,
 * or, when the import does not resolve, every resource of that class name, so a resource of the
 * same name elsewhere never stands in for a mapped one.
 */
function controllerRecords(node: Node | undefined): ResourceRecord[] {
  if (!Node.isIdentifier(node)) {
    return [];
  }
  const local = node.getText();
  const specifier = node
    .getSourceFile()
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports())
    .find(
      (candidate) =>
        (candidate.getAliasNode() ?? candidate.getNameNode()).getText() ===
        local,
    );
  const name = specifier?.getNameNode().getText() ?? local;
  const target = specifier
    ?.getImportDeclaration()
    .getModuleSpecifierSourceFile()
    ?.getFilePath();
  const named = listResourceRecords().filter(
    (record) => record.apiName === name,
  );
  const imported = named.filter((record) => record.dataApiFile === target);
  return imported.length > 0 ? imported : named;
}

/**
 * Reads a block before a patch, and returns the check to run after it: it throws when the patch
 * turned a ResourceForm into one that creates or edits rows of a table mapped from a read-only
 * connection. A patch that leaves the form's mode as it was passes.
 */
export function formGuard(target: BlockTarget): () => void {
  const before = formMode(target);
  return () => assertFormAccess(target, before);
}

/** A block as its source holds it: its type, the resources its controller may be, its form mode. */
interface WrittenBlock {
  type: string | undefined;
  records: ResourceRecord[];
  mode: string | undefined;
}

/** The path of each block a draft writes; a preserved block keeps its text, children included. */
function writtenPaths(
  blocks: readonly BlockDraft[],
  parent: readonly string[] = [],
): string[][] {
  return blocks.flatMap((block) => {
    if (block.preserve) {
      return [];
    }
    const path = [...parent, block.name];
    return [path, ...writtenPaths(block.children ?? [], path)];
  });
}

function controllerNode(target: BlockTarget): Node | undefined {
  return target.controllerArg
    ? target.factoryCall.getArguments()[0]
    : undefined;
}

function writtenBlock(
  cls: ClassDeclaration,
  path: readonly string[],
): WrittenBlock | undefined {
  const resolved = resolveBlockTarget(cls, [...path]);
  if (!resolved.ok) {
    return undefined;
  }
  const { target } = resolved;
  return {
    type: target.type,
    records: controllerRecords(controllerNode(target)),
    mode: formMode(target),
  };
}

function sameControllers(a: WrittenBlock, b: WrittenBlock): boolean {
  const refs = (block: WrittenBlock) =>
    block.records
      .map((record) => record.ref)
      .sort()
      .join("\n");
  return refs(a) === refs(b);
}

/**
 * Reads the blocks a draft rewrites, and returns the check to run on the page class once it is
 * written. It answers why the draft is refused, as AddBlock refuses a block the draft adds, or
 * puts over another controller, that would write to a table mapped from a read-only connection,
 * and as ConfigureBlock refuses a ResourceForm the draft turned into one that creates or edits its
 * rows. A block whose type, controller and mode stay as they were passes.
 */
export function draftGuard(
  cls: ClassDeclaration,
  draft: Pick<PageDraft, "blocks">,
): (written: ClassDeclaration) => string | undefined {
  const paths = writtenPaths(draft.blocks);
  const before = new Map(
    paths.map((path) => [path.join("/"), writtenBlock(cls, path)]),
  );
  return (written) => {
    for (const path of paths) {
      const after = writtenBlock(written, path);
      if (after?.type === undefined) {
        continue;
      }
      const { type } = after;
      const prior = before.get(path.join("/"));
      const kept = prior?.type === type && sameControllers(prior, after);
      if (kept && prior.mode === after.mode) {
        continue;
      }
      const form = rowWritingForm(after.mode);
      const refusal = after.records
        .map((record) => boundRefusal(type, record, form, !kept))
        .find((found) => found !== undefined);
      if (refusal) {
        return refusal;
      }
    }
    return undefined;
  };
}
