import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import { internal } from "../../attachments";
import { GetComponentPermissionIds } from "../../page";
import { hasFileColumns } from "../helpers/file-refs";
import { getTableViewMetaFor } from "./meta";

/** Apply native staging and cleanup only after the route's write guards. */
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
    const component = getTableViewMetaFor(this).componentBuilder;
    return internal.SaveTableViewAttachments({
      controller: this,
      route: baseRoute,
      context,
      params,
      args,
      mode,
      componentIds: component ? GetComponentPermissionIds(component) : [],
    });
  },
  args: baseRoute.args,
  method: baseRoute.method,
});
