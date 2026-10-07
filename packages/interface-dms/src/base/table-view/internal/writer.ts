import type { PageMetadata } from "../../../page/metadata";
import { pageMetadataByFullId } from "../../../page/internal/registry";
import type { RowActionConfig } from "../../types/row-action";
import type { TableViewCapabilities } from "./factory-helpers";
import type { TableViewAccess, TableViewMeta } from "../meta";
import type { TableViewRowActionOptions } from "../options";
import { WritingTableViewConflictError } from "../writer";

/**
 * Where the controller derivation that lifts the restriction is documented.
 *
 * @internal
 */
export const DERIVE_CONTROLLER_DOCS =
  'the DMS docs, "Show the same data in two writing screens: derive the controller" (docs/04.components/13.derived-controller.md)';

/** What a TableView can write, from the routes and forms its controller offers. */
type TableViewWriteCapabilities = Pick<
  TableViewCapabilities,
  "hasNewForm" | "hasEditForm" | "hasDeleteEndpoint" | "archiveMode"
>;

/** The writing TableView a page mounted over a controller. */
interface WritingTableViewClaim {
  /** Permission id of the TableView. */
  owner: string;
  /** The registration of the page carrying it. */
  page: PageMetadata;
}

const isEnabled = (config: boolean | RowActionConfig | undefined): boolean =>
  config === undefined ||
  (typeof config === "boolean" ? config : config.isEnabled !== false);

/**
 * `write` when the TableView enables at least one action that changes rows
 * through the data routes -- add, duplicate, edit, delete, archive or
 * restore -- and the controller offers it; `read` otherwise.
 *
 * @internal
 */
export function tableViewAccess(
  rowActions: TableViewRowActionOptions<any> | undefined,
  capabilities: TableViewWriteCapabilities,
): TableViewAccess {
  const writes = [
    capabilities.hasNewForm &&
      (isEnabled(rowActions?.add) || isEnabled(rowActions?.duplicate)),
    capabilities.hasEditForm && isEnabled(rowActions?.edit),
    capabilities.hasDeleteEndpoint && isEnabled(rowActions?.delete),
    capabilities.archiveMode &&
      (isEnabled(rowActions?.archive) || isEnabled(rowActions?.restore)),
  ];
  return writes.some(Boolean) ? "write" : "read";
}

const claims = new WeakMap<TableViewMeta, WritingTableViewClaim>();

/**
 * Record the writing TableView a page mounts over a controller, refusing a
 * second one.
 *
 * A claim only stands in the way while the page registration holding it is
 * live: a page re-registering after a hot reload replaces that registration,
 * and a page that went away leaves the controller to the next writer.
 *
 * @internal
 */
export function claimWritingTableView(
  meta: TableViewMeta,
  controllerName: string,
  claim: WritingTableViewClaim,
): void {
  const held = claims.get(meta);
  const heldPageId = held?.page.pageInfo?.fullId ?? "";
  if (
    held &&
    held.owner !== claim.owner &&
    pageMetadataByFullId.get(heldPageId) === held.page
  ) {
    throw new WritingTableViewConflictError(
      `[dms] TableView "${held.owner}" (page "${heldPageId}") and TableView "${claim.owner}" (page "${claim.page.pageInfo?.fullId}") both write through the data controller ${controllerName}. A data controller has one writing TableView: make the other one read-only (rowActions add, duplicate, edit and delete set to false, no archiveMode), or give it a controller of its own derived from ${controllerName} -- see ${DERIVE_CONTROLLER_DOCS}.`,
    );
  }
  claims.set(meta, claim);
}
