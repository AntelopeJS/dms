import type { RequestContext } from "@antelopejs/interface-api";
import type {
  DataControllerCallback,
  DataControllerInstance,
} from "@antelopejs/interface-data-api";
import { internal } from "../../../attachments";
import { GetComponentPermissionIds } from "../../../page";
import { hasFileColumns } from "../../helpers/file-refs";
import { getTableViewMetaFor } from "./meta";

/**
 * Apply native staging and cleanup only after the route's write guards.
 *
 * @internal
 */
export const withFilePromotion = <O, R, P, Rest extends unknown[]>(
  baseRoute: DataControllerCallback<O, R, [RequestContext, P, ...Rest]>,
  mode: "save" | "delete" = "save",
): DataControllerCallback<O, unknown, [RequestContext, P, ...Rest]> => ({
  func: async function (
    this: DataControllerInstance,
    context: RequestContext,
    params: P,
    ...args: Rest
  ) {
    if (!hasFileColumns(getTableViewMetaFor(this).columns)) {
      return baseRoute.func.call(this, context, params, ...args);
    }
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
