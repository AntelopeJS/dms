/**
 * Building or extending a whole page in one operation.
 *
 * The blocks and their queries are staged one after the other into a single
 * transaction, then the project is typechecked once and written, or nothing is.
 * Staging never throws away a refusal: the remaining blocks are still checked,
 * so one answer lists every block that needs fixing.
 */

import type {
  AddBlockInput,
  AddQueryInput,
  BlockPath,
  BuilderError,
  ComposeBlock,
  ComposedBlock,
  ComposePageData,
  ComposePageInput,
  ComposePreviewBlock,
  MutationOpts,
  OpResult,
  OpWarning,
  QueryResponseBody,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import type { ClassDeclaration, SourceFile } from "ts-morph";
import { resolveBlockTarget } from "./block-target";
import { errorText } from "./map-resources-pages";
import {
  checkVersion,
  commit,
  isError,
  openPage,
  stageBlock,
  staticPropertyNames,
} from "./ops";
import { stagePage } from "./ops-blocks";
import { isIdentifier, parseBlockPath } from "./paths";
import { runQueryPreview } from "./query-preview";
import { stageQuery } from "./query-ops-emit";
import { stringLiteralValue } from "./literals";
import { isPlainObject } from "./value";
import {
  findPageClass,
  getWritableProject,
  refreshFromDisk,
  Transaction,
} from "./writable";

const DEFAULT_ROUTE_KEY = "fetchUrl";

function invalid<T = never>(issues: ValidationIssue[]): OpResult<T> {
  return { ok: false, error: { code: "invalid_config", issues } };
}

/** One block of the input with the JSON pointer that names it. */
interface Entry {
  pointer: string;
  block: ComposeBlock;
}

function walk(
  blocks: ComposeBlock[],
  pointer: string,
  out: Entry[] = [],
): Entry[] {
  blocks.forEach((block, index) => {
    const at = `${pointer}/${index}`;
    out.push({ pointer: at, block });
    walk(block.children ?? [], `${at}/children`, out);
  });
  return out;
}

/** The query a block carries, as AddQuery takes it. */
function queryInput(block: ComposeBlock): AddQueryInput | undefined {
  const query = block.query;
  if (!query) {
    return undefined;
  }
  const { into: _into, args: _args, name, ...rest } = query;
  return { ...rest, name: name ?? block.name };
}

/** Everything wrong with the input that needs no project to find out. */
function structureIssues(input: ComposePageInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if ((input.page === undefined) === (input.create === undefined)) {
    issues.push({
      pointer: "/page",
      message: "name exactly one of `page` (an existing page) and `create`",
    });
  }
  if (input.create && (input.parent || input.placement)) {
    issues.push({
      pointer: "/create",
      message: "a page being created has no blocks to place the new ones among",
    });
  }
  if (input.placement?.before && input.placement.after) {
    issues.push({
      pointer: "/placement",
      message: "give `before` or `after`, not both",
    });
  }
  if (input.blocks.length === 0) {
    issues.push({ pointer: "/blocks", message: "no blocks to add" });
  }
  const queries = new Map<string, string>();
  const siblings = (blocks: ComposeBlock[], pointer: string) => {
    const names = new Set<string>();
    blocks.forEach((block, index) => {
      const at = `${pointer}/${index}`;
      if (!isIdentifier(block.name)) {
        issues.push({
          pointer: `${at}/name`,
          message: `"${String(block.name)}" is not a valid block name; expected an identifier`,
        });
      } else if (names.has(block.name)) {
        issues.push({
          pointer: `${at}/name`,
          message: `the name ${block.name} is used twice among the same siblings`,
        });
      }
      names.add(block.name);
      checkQueryName(block, at);
      siblings(block.children ?? [], `${at}/children`);
    });
  };
  const checkQueryName = (block: ComposeBlock, at: string) => {
    if (!block.query) {
      return;
    }
    const name = block.query.name ?? block.name;
    const first = queries.get(name);
    if (first) {
      issues.push({
        pointer: `${at}/query/name`,
        message: `the query name ${name} is already used by ${first}; give each query its own name`,
      });
    }
    queries.set(name, at);
    const key = block.query.into ?? DEFAULT_ROUTE_KEY;
    if (block.config && key in block.config) {
      issues.push({
        pointer: `${at}/config/${key}`,
        message: `the route of the block's query is written to "${key}"; remove it from \`config\` or point \`query.into\` elsewhere`,
      });
    }
  };
  siblings(input.blocks, "/blocks");
  return issues;
}

/** A refusal of one staged operation as issues addressed inside the input. */
function refusalIssues(
  error: BuilderError,
  pointer: string,
  subpath: (sub: string) => string,
): ValidationIssue[] {
  if (error.code === "invalid_config") {
    return error.issues.map((issue) => ({
      pointer: issue.pointer ? `${pointer}${subpath(issue.pointer)}` : pointer,
      message: issue.message,
    }));
  }
  return [{ pointer, message: errorText(error) }];
}

const inConfig = (sub: string) => `/config${sub}`;
const inQuery = (sub: string) =>
  sub === "/endpoint" ? "/query/endpoint" : `/query/params${sub}`;

interface Target {
  page: string;
  sourceFile: SourceFile;
  cls: ClassDeclaration;
  transaction: Transaction;
}

/** The names of the blocks already sitting where the new ones go. */
function siblingNames(
  target: Target,
  parent: BlockPath | undefined,
): string[] | OpResult<never> {
  if (!parent) {
    return staticPropertyNames(target.cls);
  }
  const parsed = parseBlockPath(parent);
  const resolved = parsed && resolveBlockTarget(target.cls, parsed.segments);
  if (!resolved?.ok || !resolved.target.editable) {
    return invalid([
      { pointer: "/parent", message: `${parent} is not an editable container` },
    ]);
  }
  return resolved.target.childCalls.map(
    (call) => stringLiteralValue(call.getArguments()[0]) ?? "",
  );
}

/** Where the first new block goes: next to the block named, else at the end. */
function startIndex(
  target: Target,
  input: ComposePageInput,
): { index: number | undefined } | OpResult<never> {
  const anchor = input.placement?.before ?? input.placement?.after;
  if (anchor === undefined) {
    return { index: undefined };
  }
  const names = siblingNames(target, input.parent);
  if (!Array.isArray(names)) {
    return names;
  }
  const at = names.indexOf(anchor);
  if (at < 0) {
    return invalid([
      {
        pointer: input.placement?.before
          ? "/placement/before"
          : "/placement/after",
        message: `there is no block named ${anchor} among the siblings (${names.join(", ")})`,
      },
    ]);
  }
  return { index: input.placement?.before ? at : at + 1 };
}

interface Staging {
  target: Target;
  issues: ValidationIssue[];
  warnings: OpWarning[];
  added: ComposedBlock[];
}

function stageEntry(
  staging: Staging,
  entry: Entry,
  parent: BlockPath | undefined,
  index: number | undefined,
): void {
  const { block, pointer } = entry;
  const { target } = staging;
  let route: string | undefined;
  let queryRef: string | undefined;
  const query = queryInput(block);
  if (query) {
    const staged = stageQuery(
      target.page,
      target.sourceFile,
      target.cls,
      query,
      target.transaction,
    );
    if (!staged.ok) {
      staging.issues.push(...refusalIssues(staged.error, pointer, inQuery));
      return;
    }
    route = staged.data.route;
    queryRef = staged.data.query;
    staging.warnings.push(...(staged.warnings ?? []));
  }
  const config = { ...block.config };
  if (route !== undefined) {
    config[block.query?.into ?? DEFAULT_ROUTE_KEY] = route;
  }
  const add: AddBlockInput = {
    page: target.page,
    name: block.name,
    type: block.type,
    config,
    parent,
    index,
    slot: block.slot,
    meta: block.meta,
    controller: block.controller,
  };
  const staged = stageBlock(
    target.sourceFile,
    target.cls,
    add,
    target.transaction,
  );
  if ("ok" in staged) {
    if (!staged.ok) {
      staging.issues.push(...refusalIssues(staged.error, pointer, inConfig));
    }
    return;
  }
  staging.warnings.push(...staged.warnings);
  staging.added.push({
    pointer,
    path: staged.path,
    query: queryRef,
    route,
  });
  (block.children ?? []).forEach((child, at) => {
    stageEntry(
      staging,
      { block: child, pointer: `${pointer}/children/${at}` },
      staged.path,
      undefined,
    );
  });
}

function openTarget(
  input: ComposePageInput,
  opts: MutationOpts | undefined,
): Target | OpResult<never> {
  const project = getWritableProject();
  const transaction = new Transaction(project);
  if (input.create) {
    const staged = stagePage(input.create, transaction);
    if ("ok" in staged) {
      return staged.ok
        ? { ok: false, error: { code: "not_found", ref: input.create.name } }
        : staged;
    }
    const cls = findPageClass(staged.sourceFile, input.create.name);
    if (!cls) {
      transaction.rollback();
      return {
        ok: false,
        error: { code: "not_found", ref: staged.ref },
      };
    }
    return {
      page: staged.ref,
      sourceFile: staged.sourceFile,
      cls,
      transaction,
    };
  }
  const page = input.page ?? "";
  const context = openPage(page);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return { ok: false, error: { code: "not_found", ref: page } };
  }
  transaction.track(context.sourceFile);
  return { page, sourceFile: context.sourceFile, cls, transaction };
}

function write(
  input: ComposePageInput,
  opts: MutationOpts | undefined,
): OpResult<ComposePageData> {
  const target = openTarget(input, opts);
  if ("ok" in target) {
    return target;
  }
  const staging: Staging = { target, issues: [], warnings: [], added: [] };
  try {
    const start = startIndex(target, input);
    if ("ok" in start) {
      target.transaction.rollback();
      return start;
    }
    input.blocks.forEach((block, at) => {
      stageEntry(
        staging,
        { block, pointer: `/blocks/${at}` },
        input.parent,
        start.index === undefined ? undefined : start.index + at,
      );
    });
  } catch (error) {
    target.transaction.rollback();
    throw error;
  }
  if (staging.issues.length > 0) {
    target.transaction.rollback();
    return invalid(staging.issues);
  }
  return commit(
    target.transaction,
    {
      page: target.page,
      written: true,
      blocks: staging.added,
      previews: [],
    },
    staging.warnings,
  );
}

/** Whether a previewed answer would render as an empty or all-zero block. */
export function answerStatus(body: QueryResponseBody): "ok" | "empty" | "zero" {
  if (!isPlainObject(body)) {
    return "zero";
  }
  const { series, items, value } = body;
  if (Array.isArray(items)) {
    return items.length === 0 ? "empty" : "ok";
  }
  if (Array.isArray(series)) {
    if (series.length === 0) {
      return "empty";
    }
    return series.every((point) => !(isPlainObject(point) && point.y))
      ? "zero"
      : "ok";
  }
  return value === undefined || value === null || value === 0 ? "zero" : "ok";
}

async function preview(
  input: ComposePageInput,
): Promise<OpResult<ComposePageData>> {
  const issues = structureIssues(input);
  if (issues.length > 0) {
    return invalid(issues);
  }
  const entries = walk(input.blocks, "/blocks").flatMap((entry) => {
    const query = queryInput(entry.block);
    return query ? [{ ...entry, query }] : [];
  });
  const previews = await Promise.all(
    entries.map(
      async ({ block, pointer, query }): Promise<ComposePreviewBlock> => {
        const result = await runQueryPreview({
          query,
          args: { ...input.args, ...block.query?.args },
          tenant: input.tenant,
        });
        if (!result.ok) {
          const issuesOf = refusalIssues(result.error, pointer, inQuery);
          return {
            pointer,
            block: block.name,
            status: "error",
            error: issuesOf
              .map((issue) => `${issue.pointer}: ${issue.message}`)
              .join("; "),
          };
        }
        return {
          pointer,
          block: block.name,
          status: answerStatus(result.data.body),
          preview: result.data,
        };
      },
    ),
  );
  return {
    ok: true,
    data: {
      page: input.page ?? input.create?.name ?? "",
      written: false,
      blocks: [],
      previews,
    },
    changes: [],
  };
}

export async function composePage(
  input: ComposePageInput,
  opts?: MutationOpts,
): Promise<OpResult<ComposePageData>> {
  if (input.preview) {
    return preview(input);
  }
  const issues = structureIssues(input);
  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!input.create) {
    refreshFromDisk(getWritableProject());
  }
  return write(input, opts);
}
