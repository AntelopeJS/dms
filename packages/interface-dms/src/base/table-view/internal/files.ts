import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { internal } from "../../../attachments";
import { GetComponentPermissionIds } from "../../../page";
import { hasFileColumns } from "../../helpers/file-refs";
import { getTableViewMetaFor } from "./meta";

/**
 * Apply native staging and cleanup only after the route's write guards.
 *
 * @internal
 */
export const withFilePromotion = (
  baseRoute: DataControllerCallback,
  mode: "save" | "delete" = "save",
): DataControllerCallback => ({
  func: async function (
    this: unknown,
    context: RequestContext,
    params: unknown,
    ...args: unknown[]
  ) {
    if (!hasFileColumns(getTableViewMetaFor(this).columns)) {
      return baseRoute.func.call(this, context, params, ...args);
    }
    // The writing TableView and every new/edit form mounted on this
    // controller save through this route, so a file staged from any of them is
    // one it may promote.
    const { writingComponents } = getTableViewMetaFor(this);
    return internal.SaveTableViewAttachments({
      controller: this,
      route: baseRoute,
      context,
      params,
      args,
      mode,
      componentIds: [
        ...new Set(
          writingComponents.flatMap((c) => GetComponentPermissionIds(c)),
        ),
      ],
    });
  },
  args: baseRoute.args,
  method: baseRoute.method,
});
