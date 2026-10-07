import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";

/**
 * Trusted inputs used to wrap a table-view attachment write.
 *
 * @internal
 */
export interface TableViewAttachmentSaveRequest {
  controller: unknown;
  route: DataControllerCallback;
  context: RequestContext;
  params: unknown;
  args: unknown[];
  mode: "save" | "delete";
  componentIds: string[];
}
