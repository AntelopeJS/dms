import { InterfaceFunction } from "@antelopejs/interface-core";
import type { BlockPath, PageRef } from "./addressing";
import type { AddQueryInput, QueryPreview } from "./queries";
import type { ResourceRef } from "./resources";
import type { MutationOpts, OpResult } from "./results";
import type { EditablePageMeta } from "./structure";
import type { ConfigObject } from "./values";

/**
 * A block as the caller wants it written. The whole tree is declarative: what
 * the draft describes is what the page file ends up holding.
 */
export interface BlockDraft {
  /** Static key (top-level) or `.child()` id (nested). Must be an identifier. */
  name: string;
  /** A catalog type; informational and checked against source when preserved. */
  type?: string;
  /** Understood options only. Omit locked options; the server retains their source. */
  config?: ConfigObject;
  /** Read-only UI hints. The server derives option locks from its own source. */
  lockedOptions?: Record<string, string>;
  slot?: string;
  /** Child metadata emitted with `slot`, e.g. `{ colSpan: 2 }`. */
  meta?: ConfigObject;
  /** Required for a controller-leading block type such as `TableView`. */
  controller?: ResourceRef;
  /** Preserved parents may include their unchanged, recursively preserved children. */
  children?: BlockDraft[];
  /**
   * Write the block back exactly as it stands on disk, identified by its name
   * among its siblings. This is how an opaque block — a `CustomComponent`, a
   * computed expression, anything the builder can read but not rewrite —
   * survives a whole-tree write. A `preserve` block whose name no longer
   * matches anything fails validation. Partially editable blocks keep their
   * source path, type, controller and child placement; they cannot be copied.
   */
  preserve?: boolean;
}

/** A page as the caller wants it written. */
export interface PageDraft {
  /** Metadata to patch alongside the blocks; omit to leave it alone. */
  page?: Partial<EditablePageMeta>;
  blocks: BlockDraft[];
  /**
   * The queries the page should serve, written in the same transaction as the
   * blocks — a block and the data it reads are one edit.
   *
   * Omit to leave the page's queries untouched. An empty array is not the same
   * thing: it says the page should serve none, and removes the generated ones.
   * A query a human has taken over is never rewritten or removed; it comes back
   * as a warning instead.
   */
  queries?: AddQueryInput[];
}

/** A component tree in the shape the DMS frontend consumes. */
export type ComponentPreview = {
  componentName: string;
  options?: ConfigObject;
  children?: ComponentPreviewChild[];
};

export type ComponentPreviewChild = {
  id: string;
  slot?: string;
  component: ComponentPreview;
  [key: string]: ConfigObject[string];
};

/** The preview of a page draft, keyed by top-level block name. */
export interface PageLayoutPreview {
  components: Record<string, ComponentPreview>;
  /**
   * Blocks the preview could not build faithfully — an unresolved `$ref` or
   * `$expr`, a factory that threw. Render the last known-good layout for those
   * rather than trusting this one.
   */
  degraded: BlockPath[];
}

/**
 * Write a page's whole block tree in one transaction: one typecheck, one write,
 * one `changes` list. The declarative counterpart of the per-block operations,
 * meant for an editor holding a draft of the page rather than replaying edits.
 *
 * Blocks absent from the draft are removed; static members that are not blocks
 * are left alone. Pass `expectedVersion` to make the write conditional.
 */
export const SetPageBlocks =
  InterfaceFunction<
    (
      page: PageRef,
      draft: PageDraft,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ version: string }>>
  >();

/**
 * Serialize a draft the way the runtime would, without writing anything. The
 * factories are the real ones, so the result is what the page would render.
 * Nothing is typechecked and nothing reaches disk.
 */
export const PreviewLayout =
  InterfaceFunction<
    (page: PageRef, draft: PageDraft) => Promise<OpResult<PageLayoutPreview>>
  >();

/**
 * Run a query that has not been written, and answer what its route would.
 *
 * The other half of previewing a draft: `PreviewLayout` says what the page will
 * look like, this says what its blocks will be showing. Read-only, and limited to
 * a page of points — a preview that returned a million rows would be answering a
 * different question.
 */
export const PreviewQuery =
  InterfaceFunction<
    (request: QueryPreviewRequest) => Promise<OpResult<QueryPreview>>
  >();

/** What to run, and what the route would have been handed. */
export interface QueryPreviewRequest {
  query: AddQueryInput;
  /** Values the route would receive, by the name it exposes them under. */
  args?: ConfigObject;
  /** The tenant whose rows to read, for a resource in a per-tenant schema. */
  tenant?: string;
}
