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
export const withFilePromotion = (
  baseRoute: DataControllerCallback,
  mode: "save" | "delete" = "save",
): DataControllerCallback => ({
  func: async function (
    this: DataControllerInstance,
    context: RequestContext,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Route-specific parameters pass unchanged to the wrapped callback or attachment proxy; parsing them here would alter the published wrapper behavior.
    params: unknown,
    ...args: unknown[]
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
