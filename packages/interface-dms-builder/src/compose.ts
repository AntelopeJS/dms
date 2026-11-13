import { InterfaceFunction } from "@antelopejs/interface-core";
import type { BlockPath, PageRef } from "./addressing";
import type { QueryPreviewRequest } from "./drafts";
import type { AddQueryInput, QueryPreview, QueryRef } from "./queries";
import type { AddBlockInput, CreatePageInput } from "./operations";
import type { ResourceRef } from "./resources";
import type { MutationOpts, OpResult } from "./results";

/**
 * The query a data block reads, in {@link AddQueryInput}'s shape. The route it
 * compiles to is written into the block's config, under `into`.
 */
export interface ComposeQuery extends Omit<AddQueryInput, "name"> {
  /** The query's name; defaults to the block's name. */
  name?: string;
  /** The block config key that receives the route. Defaults to `fetchUrl`. */
  into?: string;
  /** Values for this query's preview, overriding {@link ComposePageInput.args}. */
  args?: QueryPreviewRequest["args"];
}

/** One block of a composed page; a container carries its blocks in `children`. */
export interface ComposeBlock {
  /** Unique among its siblings. */
  name: string;
  /** A block type from the catalog, e.g. `GridRow`, `KpiCard`, `ChartCard`. */
  type: string;
  config?: AddBlockInput["config"];
  /** The resource whose DataAPI leads a controller-leading block such as `TableView`. */
  controller?: ResourceRef;
  /** The slot this block fills in its container. */
  slot?: string;
  /** Child metadata such as `{ colSpan: 2 }` in a grid. */
  meta?: AddBlockInput["meta"];
  /** The query this block reads; added to the page with the block. */
  query?: ComposeQuery;
  /** Blocks nested in this one, in order. */
  children?: ComposeBlock[];
}

/** Where the new blocks go among the siblings already there: next to the block named. */
export interface ComposePlacement {
  before?: string;
  after?: string;
}

/**
 * Input for `ComposePage`: builds a whole page, or extends one, in one call.
 * Name the page with `page`, or give the fields of one to create with `create`.
 */
export interface ComposePageInput {
  page?: PageRef;
  create?: CreatePageInput;
  /** An existing container to add the blocks under; omit for the page itself. */
  parent?: BlockPath;
  /** Position among the siblings already under `parent`; omit to append. */
  placement?: ComposePlacement;
  /** The blocks to add, in order. */
  blocks: ComposeBlock[];
  /**
   * Run every query against the database and answer each block's result without
   * writing anything. A second call without it writes.
   */
  preview?: boolean;
  /** The values every query's route would receive, e.g. `{ from, to }`; used by `preview`. */
  args?: QueryPreviewRequest["args"];
  /** The tenant whose rows a preview reads. */
  tenant?: string;
}

/** A block the call added. */
export interface ComposedBlock {
  /** Where the block sits in the input, e.g. `/blocks/1/children/0`. */
  pointer: string;
  path: BlockPath;
  query?: QueryRef;
  /** The route the block reads, as written into its config. */
  route?: string;
}

/** What one block's query answered in a preview. */
export interface ComposePreviewBlock {
  pointer: string;
  block: string;
  /** `empty`: no rows. `zero`: rows, but every figure is zero or missing. `error`: the query was refused. */
  status: "ok" | "empty" | "zero" | "error";
  preview?: QueryPreview;
  /** Why the query was refused, when `status` is `error`. */
  error?: string;
}

export interface ComposePageData {
  page: PageRef;
  /** False for a preview. */
  written: boolean;
  blocks: ComposedBlock[];
  /** One entry per block that reads a query; filled by a preview. */
  previews: ComposePreviewBlock[];
}

/**
 * Builds a page, or adds to one, in one operation: one rewrite of the page, one of
 * the models, one typecheck, and nothing written when any block is refused. A
 * refusal is `invalid_config` whose issues carry a JSON pointer into the input
 * (`/blocks/2/children/0/query/params/...`) per refused block, or
 * `typecheck_failed` when the whole would not compile.
 */
export const ComposePage =
  InterfaceFunction<
    (
      input: ComposePageInput,
      opts?: MutationOpts,
    ) => Promise<OpResult<ComposePageData>>
  >();
