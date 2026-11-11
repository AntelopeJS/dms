import type {
  AddBlockInput,
  BlockPath,
  ConfigObject,
  ConfigureBlock,
  ConfigureBlockOpts,
  DuplicateScope,
  EditableCategoryMeta,
  EditablePageMeta,
  MutationOpts,
  OpResult,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import {
  SyntaxKind,
  type ClassDeclaration,
  Node,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph";
import { type BlockTarget, resolveBlockTarget } from "./block-target";
import { buildCatalog } from "./catalog";
import { applyImportRef, blockCallText, childArgText } from "./emit";
import { stringLiteralValue } from "./literals";
import { contentVersion } from "./page-structure";
import { parseBlockPath, propertyKey } from "./paths";
import { moduleMismatch } from "./modules";
import { invalidateResourceIndex, resourceRefResolver } from "./resource-index";
import { type PageRecord } from "./scan";
import { findPageRecord, invalidateSourceIndex } from "./source-index";
import {
  createImportCollector,
  type EmitContext,
  InvalidValueError,
  serializeValue,
  UnknownDataTypeError,
  UnknownReferenceError,
} from "./value";
import {
  findPageClass,
  getWritableProject,
  refreshFromDisk,
  Transaction,
} from "./writable";

export function notFound<T = void>(ref: string): OpResult<T> {
  return { ok: false, error: { code: "not_found", ref } };
}

export function opaque<T = void>(targetPath: BlockPath): OpResult<T> {
  return { ok: false, error: { code: "opaque_target", path: targetPath } };
}

export function duplicate<T = void>(
  name: string,
  scope: DuplicateScope,
): OpResult<T> {
  return { ok: false, error: { code: "duplicate_name", name, scope } };
}

export function unsupported<T = void>(detail: string): OpResult<T> {
  return { ok: false, error: { code: "unsupported", detail } };
}

/** The refusal for an operation that names a module it cannot write into. */
export function moduleError(
  module: string | undefined,
  declaredIn: string | undefined,
  what: string,
): OpResult<never> | undefined {
  const mismatch = moduleMismatch(module, declaredIn, what);
  return mismatch ? invalidConfig<never>(mismatch) : undefined;
}

export function invalidConfig<T = void>(message: string): OpResult<T> {
  return {
    ok: false,
    error: { code: "invalid_config", issues: [{ pointer: "", message }] },
  };
}

export function invalidDataType<T = void>(
  error: UnknownDataTypeError,
): OpResult<T> {
  return {
    ok: false,
    error: {
      code: "invalid_config",
      issues: [
        {
          pointer: "",
          message: `${error.message}; call GetCatalog for valid DataType ids`,
        },
      ],
    },
  };
}

function invalidReference<T = void>(error: UnknownReferenceError): OpResult<T> {
  return {
    ok: false,
    error: {
      code: "invalid_config",
      issues: [
        {
          pointer: "",
          message: `${error.message}; call ListResources for valid resource refs`,
        },
      ],
    },
  };
}

/** The refusal for an author's value that cannot be serialized. */
export function invalidValue(error: InvalidValueError): OpResult<never> {
  if (error instanceof UnknownDataTypeError) {
    return invalidDataType<never>(error);
  }
  if (error instanceof UnknownReferenceError) {
    return invalidReference<never>(error);
  }
  return invalidConfig<never>(error.message);
}

export interface PageContext {
  sourceFile: SourceFile;
  page: PageRecord;
}

export function isError<T>(
  value: PageContext | OpResult<T>,
): value is OpResult<T> {
  return "ok" in value;
}

export function openPage(ref: string): PageContext | OpResult<never> {
  const page = findPageRecord(ref);
  if (!page) {
    return notFound<never>(ref);
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const sourceFile = project.getSourceFile(page.filepath);
  if (!sourceFile) {
    return notFound<never>(page.filepath);
  }
  return { sourceFile, page };
}

export function checkVersion(
  sourceFile: SourceFile,
  opts?: MutationOpts,
): OpResult<never> | undefined {
  if (!opts?.expectedVersion) {
    return undefined;
  }
  const text = sourceFile.getFullText();
  return contentVersion(text) === opts.expectedVersion
    ? undefined
    : stale(sourceFile.getFilePath(), text);
}

function stale(ref: string, text: string): OpResult<never> {
  return {
    ok: false,
    error: { code: "stale", ref, currentVersion: contentVersion(text) },
  };
}

export function commit<T>(
  transaction: Transaction,
  data: T,
  warnings: OpWarning[] = [],
): OpResult<T> {
  const errors = transaction.typecheckErrors();
  if (errors.length > 0) {
    transaction.rollback();
    return {
      ok: false,
      error: { code: "typecheck_failed", diagnostics: errors },
    };
  }
  const changed = transaction.changedOnDisk();
  if (changed) {
    transaction.rollback();
    return stale(changed.path, changed.text);
  }
  const changes = transaction.flush();
  invalidateSourceIndex();
  invalidateResourceIndex();
  return warnings.length > 0
    ? { ok: true, data, changes, warnings }
    : { ok: true, data, changes };
}

interface ClampedIndex {
  index: number;
  warnings: OpWarning[];
}

export function clampIndex(requested: number, length: number): ClampedIndex {
  const index = Math.min(Math.max(requested, 0), length);
  if (index === requested) {
    return { index, warnings: [] };
  }
  return {
    index,
    warnings: [
      {
        code: "index_clamped",
        message: `index ${requested} out of range [0, ${length}]; clamped to ${index}`,
      },
    ],
  };
}

function ensureOptionsObject(target: BlockTarget): ObjectLiteralExpression {
  if (target.optionsObj) {
    return target.optionsObj;
  }
  const index = target.controllerArg ? 1 : 0;
  return target.factoryCall
    .insertArgument(index, "{}")
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
}

type OptionsPatchValue =
  | EditablePageMeta[keyof EditablePageMeta]
  | EditableCategoryMeta[keyof EditableCategoryMeta];

/**
 * A patch of a page's or a category's own options, as the wire carries it.
 *
 * JSON has no `undefined`: an option the editor clears — a page's permission,
 * its position — arrives as `null`, which no option of a page means. It is
 * read as what the editor meant, an option to take out of the file, rather
 * than written as a `null` the page's types refuse.
 */
export function optionsPatch(
  patch: Record<string, OptionsPatchValue>,
): Record<string, OptionsPatchValue> {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      key,
      value === null ? undefined : value,
    ]),
  );
}

export function applyPatch(
  obj: ObjectLiteralExpression,
  patch: ConfigObject,
  replace: boolean,
  ctx: EmitContext,
): void {
  const initializers = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    initializers.set(
      key,
      value === undefined ? undefined : serializeValue(value, ctx),
    );
  }
  if (replace) {
    for (const prop of obj.getProperties()) {
      prop.remove();
    }
  }
  for (const [key, initializer] of initializers) {
    const existing = obj.getProperty(key);
    if (initializer === undefined) {
      if (existing) {
        existing.remove();
      }
      continue;
    }
    if (existing && Node.isPropertyAssignment(existing)) {
      existing.setInitializer(initializer);
    } else {
      obj.addPropertyAssignment({ name: propertyKey(key), initializer });
    }
  }
}

/** The `.child()` third argument, created when the call does not carry one. */
function ensureChildMetaObject(
  target: BlockTarget,
): ObjectLiteralExpression | undefined {
  const call = target.childCall;
  if (!call) return undefined;
  const existing = call.getArguments()[2];
  if (existing && Node.isObjectLiteralExpression(existing)) return existing;
  if (existing) return undefined;
  return call
    .addArgument("{}")
    .asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
}

export function childArgsOf(target: BlockTarget): string[] {
  return target.childCalls.map((call) =>
    call
      .getArguments()
      .map((arg) => arg.getText())
      .join(", "),
  );
}

export function setChildren(target: BlockTarget, argTexts: string[]): void {
  const base = target.factoryCall.getText();
  const chain = base + argTexts.map((arg) => `.child(${arg})`).join("");
  target.chainExpr.replaceWithText(chain);
}

export function staticPropertyNames(cls: ClassDeclaration): string[] {
  return cls
    .getStaticProperties()
    .filter((prop) => Node.isPropertyDeclaration(prop))
    .map((prop) => prop.getName());
}

function insertStatic(
  cls: ClassDeclaration,
  name: string,
  initializer: string,
  index?: number,
): void {
  const staticProps = cls
    .getStaticProperties()
    .filter((prop) => Node.isPropertyDeclaration(prop));
  const members = cls.getMembers();
  const position =
    index !== undefined && index < staticProps.length
      ? members.indexOf(staticProps[index])
      : members.length;
  cls.insertProperty(position, { isStatic: true, name, initializer });
}

export function configureBlock(
  targetPath: string,
  patch: Parameters<typeof ConfigureBlock>[1],
  opts?: ConfigureBlockOpts,
): OpResult {
  const parsed = parseBlockPath(targetPath);
  if (!parsed) {
    return notFound(targetPath);
  }
  const context = openPage(parsed.pageRef);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound(parsed.pageRef);
  }
  const resolved = resolveBlockTarget(cls, parsed.segments);
  if (!resolved.ok) {
    return resolved.reason === "not_found"
      ? notFound(targetPath)
      : opaque(targetPath);
  }
  if (!resolved.target.editable) {
    return opaque(targetPath);
  }
  if (opts?.meta && !resolved.target.childCall) {
    return unsupported("a top-level block carries no child metadata");
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  try {
    applyPatch(
      ensureOptionsObject(resolved.target),
      patch,
      opts?.replace ?? false,
      ctx,
    );
    if (opts?.meta) {
      const metaObject = ensureChildMetaObject(resolved.target);
      if (!metaObject) {
        transaction.rollback();
        return unsupported("child metadata is not a plain object literal");
      }
      applyPatch(metaObject, opts.meta, false, ctx);
    }
  } catch (error) {
    transaction.rollback();
    if (error instanceof InvalidValueError) {
      return invalidValue(error);
    }
    throw error;
  }
  for (const importRef of imports) {
    applyImportRef(context.sourceFile, importRef);
  }
  return commit(transaction, undefined);
}

/**
 * Resolves the parent a new block is added under, and rejects a name that
 * would collide with one of its siblings. With no parent given, the block sits
 * directly on the page and the collision is against the page's own statics.
 */
function resolveAddParent(
  cls: ClassDeclaration,
  input: AddBlockInput,
): { target: BlockTarget | undefined } | OpResult<never> {
  if (!input.parent) {
    return staticPropertyNames(cls).includes(input.name)
      ? duplicate<never>(input.name, "page")
      : { target: undefined };
  }
  const parsedParent = parseBlockPath(input.parent);
  if (!parsedParent) {
    return notFound<never>(input.parent);
  }
  const resolved = resolveBlockTarget(cls, parsedParent.segments);
  if (!resolved.ok) {
    return resolved.reason === "not_found"
      ? notFound<never>(input.parent)
      : opaque<never>(input.parent);
  }
  if (!resolved.target.editable) {
    return opaque<never>(input.parent);
  }
  const ids = resolved.target.childCalls.map((call) =>
    stringLiteralValue(call.getArguments()[0]),
  );
  return ids.includes(input.name)
    ? duplicate<never>(input.name, "siblings")
    : { target: resolved.target };
}

/**
 * A block type either takes a controller or it does not; supplying the wrong
 * one is a configuration error rather than something to silently ignore.
 */
function checkControllerArity(
  descriptor: { controllerArg?: unknown; type: string },
  input: AddBlockInput,
): OpResult<never> | undefined {
  if (!descriptor.controllerArg && input.controller) {
    return invalidConfig<never>(
      `block type "${input.type}" does not take a controller`,
    );
  }
  if (descriptor.controllerArg && !input.controller) {
    return invalidConfig<never>(
      `block type "${input.type}" requires a controller (a resource ref); call ListResources`,
    );
  }
  return undefined;
}

export interface StagedBlock {
  path: BlockPath;
  warnings: OpWarning[];
}

/**
 * Writes a block into a page's class inside a transaction the caller owns and
 * commits, so several blocks can share one typecheck. Refuses before it
 * mutates anything: a failed call leaves the class as it found it.
 */
export function stageBlock(
  sourceFile: SourceFile,
  cls: ClassDeclaration,
  input: AddBlockInput,
  transaction: Transaction,
): StagedBlock | OpResult<never> {
  const descriptor = buildCatalog().blocks.find(
    (block) => block.type === input.type,
  );
  if (!descriptor) {
    return unsupported<never>(`unknown block type "${input.type}"`);
  }
  const parent = resolveAddParent(cls, input);
  if (!("target" in parent)) {
    return parent;
  }
  const parentTarget = parent.target;

  const controllerMismatch = checkControllerArity(descriptor, input);
  if (controllerMismatch) {
    return controllerMismatch;
  }
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  let valueText: string;
  let childText: string | undefined;
  try {
    const controllerText = input.controller
      ? serializeValue({ $ref: { resource: input.controller } }, ctx)
      : undefined;
    valueText = blockCallText(input.type, input.config, ctx, controllerText);
    childText = parentTarget
      ? childArgText(input.name, valueText, ctx, input.slot, input.meta)
      : undefined;
  } catch (error) {
    if (error instanceof InvalidValueError) {
      return invalidValue(error);
    }
    throw error;
  }
  transaction.track(sourceFile);
  applyImportRef(sourceFile, descriptor.import);
  for (const importRef of imports) {
    applyImportRef(sourceFile, importRef);
  }
  if (parentTarget && childText !== undefined) {
    const args = childArgsOf(parentTarget);
    const clamped = clampIndex(input.index ?? args.length, args.length);
    args.splice(clamped.index, 0, childText);
    setChildren(parentTarget, args);
    return {
      path: `${input.parent}/${input.name}`,
      warnings: clamped.warnings,
    };
  }
  const staticCount = staticPropertyNames(cls).length;
  const warnings = clampIndex(input.index ?? staticCount, staticCount).warnings;
  insertStatic(cls, input.name, valueText, input.index);
  return { path: `${input.page}#${input.name}`, warnings };
}

export function addBlock(
  input: AddBlockInput,
  opts?: MutationOpts,
): OpResult<{ path: BlockPath }> {
  const context = openPage(input.page);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound<{ path: BlockPath }>(input.page);
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  const staged = stageBlock(context.sourceFile, cls, input, transaction);
  if ("ok" in staged) {
    return staged;
  }
  return commit(transaction, { path: staged.path }, staged.warnings);
}
