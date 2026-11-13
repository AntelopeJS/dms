import { InterfaceFunction } from "@antelopejs/interface-core";
import type { BlockPath, CategoryRef, PageRef } from "./addressing";
import type { BlockCatalog, DataSourceDescriptor } from "./catalog";
import type { ResourceRef } from "./resources";
import type { MutationOpts, OpResult } from "./results";
import type {
  CategorySummary,
  EditableCategoryMeta,
  EditablePageMeta,
  PagePermission,
  PageStructure,
  PageSummary,
} from "./structure";
import type { ConfigObject } from "./values";

/** Reconcile scope for `RefreshSourceIndex`. Omit to reconcile everything. */
export interface RefreshScope {
  page?: PageRef;
}

/** Input for `CreatePage`. Attaches to an EXISTING category only in v1. */
export interface CreatePageInput {
  /** Unique route id/slug — duplicate → `duplicate_name`. */
  name: string;
  displayName: string;
  category: CategoryRef;
  icon?: string;
  order?: number;
  description?: string;
  permission?: PagePermission;
  /**
   * Override the default category-relative placement with an explicit folder
   * relative to the src root; the page lands at `src/<dir>/<name>/page.ts` and
   * the nearest barrel is wired. Must stay within the src tree.
   */
  dir?: string;
  /**
   * The project module to write into, by its id in the project configuration. Unset, the
   * project's own module. A module is one of the project's local modules with an `src/index.ts`;
   * what it writes may only use declarations from that same module.
   */
  module?: string;
}

/** Input for `CreateCategory`. */
export interface CreateCategoryInput {
  name: string;
  displayName: string;
  parent?: CategoryRef;
  icon?: string;
  order?: number;
  /** As `CreatePageInput.module`. */
  module?: string;
}

/** Input for `AddBlock`. */
export interface AddBlockInput {
  page: PageRef;
  /** Omit = top-level static; else must be an editable container. */
  parent?: BlockPath;
  slot?: string;
  /** Position among siblings; default = append. */
  index?: number;
  /** Unique among siblings — duplicate → `duplicate_name`. */
  name: string;
  /**
   * Child metadata emitted alongside `slot` in the third argument of `.child()`
   * — `{ colSpan: 2 }` for a grid child. Ignored for a top-level block.
   */
  meta?: ConfigObject;
  /** A block type from the catalog. */
  type: string;
  config: ConfigObject;
  /**
   * Required for controller-leading block types (catalog `controllerArg: true`,
   * e.g. `TableView`): the resource whose DataAPI class is the leading argument.
   * The engine emits it as the imported class identifier. Rejected for other
   * block types.
   */
  controller?: ResourceRef;
}

/** Destination for `MoveBlock`. */
export interface MoveDest {
  parent?: BlockPath;
  slot?: string;
  index: number;
}

/** Options for `ConfigureBlock`. */
export interface ConfigureBlockOpts extends MutationOpts {
  /** Replace the whole options object instead of merging. */
  replace?: boolean;
  /**
   * Patch the block's child metadata (`slot`, `colSpan`, …) as well. A key set
   * to `undefined` is removed. Rejected on a top-level block, which has no
   * `.child()` call to carry it.
   */
  meta?: ConfigObject;
}

export const ListPages = InterfaceFunction<() => Promise<PageSummary[]>>();
export const ListCategories =
  InterfaceFunction<() => Promise<CategorySummary[]>>();
export const GetCatalog = InterfaceFunction<() => Promise<BlockCatalog>>();

/**
 * The sources a developer declared beside their own routes, optionally narrowed
 * to those a given block can read.
 *
 * Separate from the catalog because they come and go with module loads, and a
 * caller asking for them wants what is registered now.
 */
export const ListDataSources =
  InterfaceFunction<(response?: string) => Promise<DataSourceDescriptor[]>>();
export const GetPageStructure =
  InterfaceFunction<(ref: PageRef) => Promise<OpResult<PageStructure>>>();

/**
 * Force reconcile against disk (e.g. after a vibe-mode excursion). Deduped:
 * mtime-gated, scoped, and coalesced — safe to over-call.
 */
export const RefreshSourceIndex =
  InterfaceFunction<(scope?: RefreshScope) => Promise<void>>();

export const CreatePage =
  InterfaceFunction<
    (
      input: CreatePageInput,
    ) => Promise<OpResult<{ ref: PageRef; filepath: string }>>
  >();
/**
 * Patch a page's metadata. The result carries the page's ref, which the patch
 * can change: a page's category decides its route, so moving it between
 * categories moves its URL — reported as a `route_changed` warning, since
 * nothing redirects the old one. It also carries the version of the page file
 * it wrote, which a draft held across the patch saves against.
 */
export const ConfigurePage =
  InterfaceFunction<
    (
      ref: PageRef,
      patch: Partial<EditablePageMeta>,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ ref: PageRef; version: string }>>
  >();
export const DeletePage =
  InterfaceFunction<(ref: PageRef, opts?: MutationOpts) => Promise<OpResult>>();

export const CreateCategory =
  InterfaceFunction<
    (input: CreateCategoryInput) => Promise<OpResult<{ ref: CategoryRef }>>
  >();
export const ConfigureCategory =
  InterfaceFunction<
    (
      ref: CategoryRef,
      patch: Partial<EditableCategoryMeta>,
    ) => Promise<OpResult>
  >();
export const DeleteCategory =
  InterfaceFunction<(ref: CategoryRef) => Promise<OpResult>>();

export const AddBlock =
  InterfaceFunction<
    (
      input: AddBlockInput,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ path: BlockPath }>>
  >();
export const ConfigureBlock =
  InterfaceFunction<
    (
      path: BlockPath,
      patch: ConfigObject,
      opts?: ConfigureBlockOpts,
    ) => Promise<OpResult>
  >();
export const MoveBlock =
  InterfaceFunction<
    (path: BlockPath, dest: MoveDest, opts?: MutationOpts) => Promise<OpResult>
  >();
export const RemoveBlock =
  InterfaceFunction<
    (path: BlockPath, opts?: MutationOpts) => Promise<OpResult>
  >();
