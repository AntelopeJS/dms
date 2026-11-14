import type {
  ConfigObject,
  ConfigValue,
  ImportRef,
  OpWarning,
  BlockNode,
  BlockDraft,
  MutationOpts,
  OpResult,
  PageDraft,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  type Expression,
  Node,
  SymbolFlags,
  type PropertyDeclaration,
  type PropertyDeclarationStructure,
  type SourceFile,
} from "ts-morph";
import { blockDescriptor, isControllerLeadingBlock } from "./catalog";
import { buildPageBlocks } from "./block-tree";
import { draftGuard } from "./connection-access";
import { isBlockInitializer, resolveAndUnwrap } from "./chain";
import { type NamedConstant, objectLiteralToValue } from "./config-literal";
import { patchSourceOptions } from "./source-options";
import {
  applyImportRef,
  blockCallText,
  childArgText,
  importSpecifier,
} from "./emit";
import { getExtendsCall, stringLiteralValue } from "./literals";
import { applyPatch, optionsPatch } from "./options-patch";
import {
  checkVersion,
  commit,
  invalidConfig,
  invalidValue,
  isError,
  notFound,
  openPage,
  unsupported,
} from "./ops";
import { pageVersion } from "./page-structure";
import { syncQueries } from "./query-sync";
import { validateDraft } from "./page-draft-validation";
import { resourceRefResolver } from "./resource-index";
import {
  createImportCollector,
  type EmitContext,
  isPlainObject,
  InvalidValueError,
  serializeValue,
} from "./value";
import {
  findPageClass,
  pruneUnusedImports,
  referencedImportNames,
  Transaction,
} from "./writable";

/** Source text of every block already on the page, keyed by its draft path. */
type OriginalTexts = Map<string, string>;

/** The declaration a top-level block was written as, so a rewrite keeps it. */
type OriginalStatics = Map<string, PropertyDeclarationStructure>;

/** Named constants by where each sits, its path as `JSON.stringify` writes it. */
type ConstantsByPath = Map<string, NamedConstant>;

/**
 * The named constants a block was written with: in its own options, and in the
 * third argument of the `.child()` call placing it.
 */
interface BlockConstants {
  config: ConstantsByPath;
  meta: ConstantsByPath;
}

/** What every block already on the page was written as, by its draft path. */
interface Originals {
  texts: OriginalTexts;
  constants: Map<string, BlockConstants>;
  nodes: Map<string, BlockNode>;
  expressions: Map<string, Expression>;
  callees: Map<string, string>;
}

/**
 * Note what a block was written as, then the same for each of its children:
 * its text, so a draft can preserve it, and the constants it named, so a
 * rewrite can put them back.
 */
function collectBlock(
  expr: Expression,
  path: string,
  originals: Originals,
  metaArg?: Node,
): void {
  originals.texts.set(path, expr.getText());
  originals.expressions.set(path, expr);
  const { chain } = resolveAndUnwrap(expr);
  if (!chain) {
    return;
  }
  if (chain.factory && chain.factoryCall) {
    originals.callees.set(path, chain.factoryCall.getExpression().getText());
    const args = chain.factoryCall.getArguments();
    originals.constants.set(path, {
      config: constantsIn(
        args[isControllerLeadingBlock(chain.factory) ? 1 : 0],
      ),
      meta: constantsIn(metaArg),
    });
  }
  for (const call of chain.childCalls) {
    const [idArg, valueArg, childMeta] = call.getArguments();
    const id = stringLiteralValue(idArg);
    if (!id || !valueArg || !Node.isExpression(valueArg)) {
      continue;
    }
    collectBlock(valueArg, `${path}/${id}`, originals, childMeta);
  }
}

/** The constants among options, found where the reader resolves them. */
function constantsIn(options: Node | undefined): ConstantsByPath {
  const read = options ? objectLiteralToValue(options).constants : undefined;
  return new Map(
    (read ?? []).map((constant) => [JSON.stringify(constant.path), constant]),
  );
}

/**
 * Options with each constant they were read from put back by name, as the
 * source text the emitter writes verbatim — so a page whose author named a
 * value keeps the name through every save that did not change it.
 *
 * Only where the author wrote it, and only while the value there is still the
 * one it holds, or, for an enum member, one another member of its enum holds.
 * The same value anywhere else was typed out, or set in the builder, and
 * naming it would tie it to a constant it never used.
 */
function withConstants(
  options: ConfigObject,
  constants: ConstantsByPath | undefined,
): ConfigObject {
  return constants?.size
    ? Object.fromEntries(
        Object.entries(options).map(([key, item]) => [
          key,
          namedAt(item, [key], constants),
        ]),
      )
    : options;
}

function namedAt(
  value: ConfigValue,
  path: (string | number)[],
  constants: ConstantsByPath,
): ConfigValue {
  const constant = constants.get(JSON.stringify(path));
  const named =
    constant?.value === value
      ? constant
      : constant?.members?.find((member) => member.value === value);
  if (named) {
    return { $expr: named.name };
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      namedAt(item, [...path, index], constants),
    );
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        namedAt(item, [...path, key], constants),
      ]),
    );
  }
  return value;
}

/**
 * The statics `GetPageStructure` reports as blocks — exactly those, including
 * the ones it reports opaque.
 *
 * A static the reader lists but the writer skips can never be preserved: the
 * draft asks to keep it, the writer finds no original under that name and
 * refuses the whole save, so a page holding an imported or computed block
 * becomes unsavable. A static that resolves to something that is not a block at
 * all is not listed either side, and stays untouched.
 */
function blockStatics(cls: ClassDeclaration): PropertyDeclaration[] {
  return cls
    .getStaticProperties()
    .filter((prop): prop is PropertyDeclaration =>
      Node.isPropertyDeclaration(prop),
    )
    .filter((prop) => !prop.getName().startsWith("_"))
    .filter((prop) => {
      const init = prop.getInitializer();
      return init !== undefined && isBlockInitializer(init);
    });
}

/**
 * The declaration each block static was written as, with every comment above
 * it carried verbatim and in order.
 *
 * `getStructure()` reports a doc block in `docs` and ignores a plain line or
 * block comment, which is trivia, so re-inserting from the structure alone
 * leaves the plain comment behind to drift to the bottom of the class. All the
 * comments are taken as `leadingTrivia` and `docs` is cleared: that keeps them
 * together and writes each exactly once, whereas carrying a doc block in both
 * places writes it twice, and again on every later save.
 */
function collectStatics(cls: ClassDeclaration): OriginalStatics {
  const statics: OriginalStatics = new Map();
  for (const prop of blockStatics(cls)) {
    const structure = prop.getStructure();
    const leading = prop
      .getLeadingCommentRanges()
      .map((range) => range.getText())
      .join("\n");
    if (leading) {
      structure.docs = [];
      structure.leadingTrivia = `${leading}\n`;
    }
    statics.set(prop.getName(), structure);
  }
  return statics;
}

function collectOriginals(
  cls: ClassDeclaration,
  blocks: BlockNode[],
): Originals {
  const originals: Originals = {
    texts: new Map(),
    constants: new Map(),
    nodes: new Map(),
    expressions: new Map(),
    callees: new Map(),
  };
  function index(nodes: BlockNode[], parent = "") {
    for (const node of nodes) {
      const path = parent ? `${parent}/${node.name}` : node.name;
      originals.nodes.set(path, node);
      index(node.children ?? [], path);
    }
  }
  index(blocks);
  for (const prop of blockStatics(cls)) {
    const init = prop.getInitializer();
    if (init) {
      collectBlock(init, prop.getName(), originals);
    }
  }
  return originals;
}

function draftText(
  block: BlockDraft,
  path: string,
  originals: Originals,
  ctx: EmitContext,
): string {
  const preserved = originals.texts.get(path);
  if (block.preserve && preserved !== undefined) {
    return preserved;
  }
  if (originals.nodes.get(path)?.lockedOptions) {
    return patchSourceOptions(
      originals.expressions.get(path)!,
      originals.nodes.get(path)!,
      withConstants(block.config ?? {}, originals.constants.get(path)?.config),
      (block.children ?? []).map((child) => ({
        expression: originals.expressions.get(`${path}/${child.name}`)!,
        text: draftText(child, `${path}/${child.name}`, originals, ctx),
      })),
      ctx,
    );
  }
  const controllerText = block.controller
    ? serializeValue({ $ref: { resource: block.controller } }, ctx)
    : undefined;
  const base = blockCallText(
    (originals.nodes.get(path)?.type === block.type
      ? originals.callees.get(path)
      : undefined) ??
      block.type ??
      "",
    withConstants(block.config ?? {}, originals.constants.get(path)?.config),
    ctx,
    controllerText,
  );
  const children = block.children ?? [];
  return (
    base +
    children
      .map((child) => {
        const childPath = `${path}/${child.name}`;
        const value = draftText(child, childPath, originals, ctx);
        const meta = withConstants(
          { slot: child.slot, ...child.meta },
          originals.constants.get(childPath)?.meta,
        );
        return `.child(${childArgText(child.name, value, ctx, undefined, meta)})`;
      })
      .join("")
  );
}

function blockImports(
  block: BlockDraft,
  ctx: EmitContext,
  originals: Originals,
  path: string,
): void {
  if (!block.preserve && originals.nodes.get(path)?.type !== block.type) {
    const descriptor = block.type ? blockDescriptor(block.type) : undefined;
    if (descriptor) {
      ctx.addImport(descriptor.import);
    }
  }
  for (const child of block.children ?? []) {
    blockImports(child, ctx, originals, `${path}/${child.name}`);
  }
}

/**
 * Patch the page's own options in the same transaction as its blocks, so one
 * call is one typecheck and one write. Returns the failure, or nothing.
 *
 * An option sent back with the value a constant or a template of constants
 * gives it keeps that source text, as a block's options do.
 *
 * The class is found again rather than passed in: rewriting the blocks removes
 * text from the file, and ts-morph forgets every node in it when that happens.
 * A node captured before the rewrite throws the moment it is read.
 *
 * A `category` patch is refused: moving a page rewrites its file's location
 * and its registration, so it belongs to `ConfigurePage`, not to a draft save
 * that may still be discarded.
 */
function applyPageMeta(
  sourceFile: SourceFile,
  id: string,
  patch: NonNullable<PageDraft["page"]>,
  ctx: EmitContext,
): OpResult<{ version: string }> | undefined {
  const cls = findPageClass(sourceFile, id);
  if (!cls) {
    return notFound<{ version: string }>(id);
  }
  const { category, ...scalar } = patch;
  if (category !== undefined) {
    return unsupported<{ version: string }>(
      "a page's category is moved with ConfigurePage, not as part of a block draft",
    );
  }
  const optionsArg = getExtendsCall(cls)?.getArguments()[1];
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) {
    return unsupported<{ version: string }>(
      "page options are not a plain object literal",
    );
  }
  applyPatch(
    optionsArg,
    withConstants(optionsPatch(optionsArg, scalar), constantsIn(optionsArg)),
    false,
    ctx,
  );
  return undefined;
}

/**
 * Replace the page's block statics with the draft's, in place of the first one.
 *
 * A property's leading plain comment is trivia, not part of the node, so each
 * block's comments and the block itself are removed as one span; otherwise the
 * comment drifts to the bottom of the class while its copy is re-inserted above
 * the block. Every span is measured before anything is removed and they are
 * removed last first, and nothing reads a node in between, because removing
 * text makes ts-morph forget the whole tree (the class is found again by name).
 *
 * A block already on the page keeps how it was declared (doc comment,
 * modifiers, type annotation); only the value is the draft's. Preserved blocks
 * keep their original line breaks: only freshly written initializers are
 * reindented, and source-backed ones are restored through raw text ranges after
 * all printing, since structure printers indent multiline strings.
 */
function rewriteStatics(
  cls: ClassDeclaration,
  draft: PageDraft,
  originals: Originals,
  ctx: EmitContext,
): void {
  const statics = collectStatics(cls);
  const texts = draft.blocks.map((block) => ({
    name: block.name,
    initializer: draftText(block, block.name, originals, ctx),
  }));
  const anchor = blockStatics(cls)[0];
  const position = anchor
    ? cls.getMembers().indexOf(anchor)
    : cls.getMembers().length;
  const className = cls.getName();
  const sourceFile = cls.getSourceFile();
  const spans = blockStatics(cls).map((prop) => {
    const comments = prop.getLeadingCommentRanges();
    const start = comments[0]?.getPos() ?? prop.getStart();
    return [start, prop.getEnd()] as const;
  });
  for (const [start, end] of [...spans].reverse()) {
    sourceFile.removeText(start, end);
  }
  const target =
    (className ? sourceFile.getClass(className) : undefined) ??
    sourceFile.getClasses()[0];
  if (!target) {
    return;
  }
  const inserted = target.insertProperties(
    position,
    texts.map((entry) => ({
      ...(statics.get(entry.name) ?? { isStatic: true }),
      name: entry.name,
      initializer: entry.initializer,
    })),
  );
  const hasSource = (block: BlockDraft, path: string): boolean =>
    !!block.preserve ||
    !!originals.nodes.get(path)?.lockedOptions ||
    (block.children ?? []).some((child) =>
      hasSource(child, `${path}/${child.name}`),
    );
  for (const [index, property] of inserted.entries()) {
    if (!hasSource(draft.blocks[index], draft.blocks[index].name))
      property.formatText();
  }
  const exact = inserted.flatMap((property, index) => {
    if (!hasSource(draft.blocks[index], draft.blocks[index].name)) return [];
    const initializer = property.getInitializerOrThrow();
    return [
      {
        start: initializer.getStart(),
        end: initializer.getEnd(),
        text: texts[index].initializer,
      },
    ];
  });
  sourceFile.applyTextChanges(
    exact.map((entry) => ({
      span: { start: entry.start, length: entry.end - entry.start },
      newText: entry.text,
    })),
  );
}

/**
 * The first name an import would bind that the file already binds to something
 * else, so adding the import would shadow it.
 */
function shadowedImport(
  sourceFile: SourceFile,
  imports: ImportRef[],
): string | undefined {
  const bindings = new Map(
    sourceFile
      .getSymbolsInScope(SymbolFlags.Value | SymbolFlags.Alias)
      .map((symbol) => [symbol.getName(), symbol]),
  );
  for (const ref of imports) {
    const name = ref.name.split(".")[0];
    const binding = bindings.get(name);
    const module = importSpecifier(sourceFile, ref);
    if (
      binding &&
      module &&
      !binding
        .getDeclarations()
        .some(
          (declaration) =>
            Node.isImportSpecifier(declaration) &&
            declaration.getName() === name &&
            declaration.getImportDeclaration().getModuleSpecifierValue() ===
              module,
        )
    ) {
      return name;
    }
  }
  return undefined;
}

/**
 * Replace a page's blocks (and optionally its own options and queries) with a
 * draft, in one transaction: one typecheck and one write.
 *
 * Only imports the file referenced before the rewrite are pruned afterwards; an
 * import that was already unused is the author's business and removing it
 * would put an unrequested change in the diff of a save. Page options are
 * patched before the imports are flushed, inside the same error guard as the
 * blocks, because a page option can carry a value that needs an import and
 * serializing it fails the same way a block's config does. Queries go in
 * before the commit, so a block and the data it reads are one write; an absent
 * `queries` leaves them alone, an empty one says the page serves none. The
 * returned version is read after every edit, so the next conditional write
 * does not fail as stale against itself.
 */
export function setPageBlocks(
  ref: string,
  draft: PageDraft,
  opts?: MutationOpts,
): OpResult<{ version: string }> {
  const context = openPage(ref);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound<{ version: string }>(ref);
  }
  const originals = collectOriginals(
    cls,
    buildPageBlocks({ ...context.page, classNode: cls }),
  );
  const referencedNames = referencedImportNames(context.sourceFile);
  const issues = validateDraft(draft, originals.texts, originals.nodes);
  if (issues.length > 0) {
    return { ok: false, error: { code: "invalid_config", issues } };
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  const checkAccess = draftGuard(cls, draft);
  try {
    rewriteStatics(cls, draft, originals, ctx);
    if (draft.page) {
      const patched = applyPageMeta(
        context.sourceFile,
        context.page.id,
        draft.page,
        ctx,
      );
      if (patched) {
        transaction.rollback();
        return patched;
      }
    }
  } catch (error) {
    transaction.rollback();
    if (error instanceof InvalidValueError) {
      return invalidValue(error);
    }
    throw error;
  }
  for (const block of draft.blocks) {
    blockImports(block, ctx, originals, block.name);
  }
  const shadowed = shadowedImport(context.sourceFile, imports);
  if (shadowed !== undefined) {
    transaction.rollback();
    return invalidConfig(
      `Cannot emit "${shadowed}": that name belongs to another binding. Rename it in source before adding this option or block`,
    );
  }
  for (const importRef of imports) {
    applyImportRef(context.sourceFile, importRef);
  }
  const written = findPageClass(context.sourceFile, context.page.id);
  const refusal = written && checkAccess(written);
  if (!written || refusal) {
    transaction.rollback();
    return refusal ? invalidConfig(refusal) : notFound(ref);
  }
  let warnings: OpWarning[] = [];
  if (draft.queries) {
    const synced = syncQueries(
      {
        page: ref,
        pageFile: context.sourceFile,
        pageClass: written,
        transaction,
        blocks: draft.blocks,
      },
      draft.queries,
    );
    if ("ok" in synced) {
      transaction.rollback();
      return synced;
    }
    warnings = synced;
  }
  pruneUnusedImports(context.sourceFile, referencedNames);
  return commit(
    transaction,
    { version: pageVersion(context.sourceFile) },
    warnings,
  );
}
