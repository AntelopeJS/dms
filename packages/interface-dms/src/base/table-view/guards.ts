import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type DataControllerCallback,
  DefaultRoutes,
} from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { GuardFn } from "../types/guards";
import { fetchRowForGuard } from "./data-functions";
import { TableViewMeta } from "./meta";
import { DEFAULT_ROW_ID_FIELD } from "./options";
import { normalizeToArray } from "./row-rules";

type GuardedActionName = "edit" | "delete" | "archive" | "restore" | "new";

export const parseGuardBody = (raw: unknown): Record<string, unknown> => {
  if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString());
  if (typeof raw === "string" && raw.length > 0) return JSON.parse(raw);
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
};

interface GuardInvocationConfig {
  // A published contract: the runtime calls this positionally and every
  // implementing module declares the same shape, so an options object
  // cannot be introduced from this side.
  // oxlint-disable-next-line eslint/max-params
  invokeGuard: (
    controller: unknown,
    ctx: RequestContext,
    params: unknown,
    args: unknown[],
    guard: GuardFn<any>,
    idField: string,
  ) => Promise<void>;
}

const ACTION_GUARD_CONFIGS: Record<GuardedActionName, GuardInvocationConfig> = {
  edit: {
    // A published contract: the runtime calls this positionally and every
    // implementing module declares the same shape, so an options object
    // cannot be introduced from this side.
    // oxlint-disable-next-line eslint/max-params
    invokeGuard: async (controller, ctx, params, args, guard, idField) => {
      const id = String((params as Parameters.EditParameters).id);
      const body = parseGuardBody(args[0]);
      const current = await fetchRowForGuard(
        controller as DataControllerCallback,
        id,
        idField,
      );
      throwHttpAssert(current, 404, "Not Found");
      await guard.call(controller, ctx, { id, body, current });
    },
  },
  delete: {
    invokeGuard: async (controller, ctx, params, _args, guard) => {
      const ids = normalizeToArray(
        (params as Parameters.DeleteParameters).id as string | string[],
      );
      await guard.call(controller, ctx, { ids });
    },
  },
  archive: {
    invokeGuard: async (controller, ctx, params, _args, guard) => {
      const ids = normalizeToArray(params as string | string[]);
      await guard.call(controller, ctx, { ids });
    },
  },
  restore: {
    invokeGuard: async (controller, ctx, params, _args, guard) => {
      const ids = normalizeToArray(params as string | string[]);
      await guard.call(controller, ctx, { ids });
    },
  },
  new: {
    invokeGuard: async (controller, ctx, _params, args, guard) => {
      const body = parseGuardBody(args[0]);
      await guard.call(controller, ctx, { body });
    },
  },
};

const getGuardForAction = (
  controller: unknown,
  actionName: GuardedActionName | "get",
): GuardFn<any> | undefined => {
  const meta = GetMetadata(
    (controller as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  return meta.controllerGuards?.[actionName] as GuardFn<any> | undefined;
};

export const guardedGetRoute = DefaultRoutes.WithGetGuard(
  async function (ctx, current, params) {
    await getGuardForAction(this, "get")?.call(this, ctx, {
      id: params.id,
      current,
    });
  },
);

const getIdField = (controller: unknown): string => {
  const meta = GetMetadata(
    (controller as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  return meta.options.rowIdKey || DEFAULT_ROW_ID_FIELD;
};

export const createGuardedRoute = (
  baseRoute: DataControllerCallback,
  actionName: GuardedActionName,
): DataControllerCallback => {
  const config = ACTION_GUARD_CONFIGS[actionName];
  return {
    func: async function (
      this: unknown,
      ctx: RequestContext,
      params: unknown,
      ...args: unknown[]
    ) {
      const guard = getGuardForAction(this, actionName);
      if (guard) {
        await config.invokeGuard(
          this,
          ctx,
          params,
          args,
          guard,
          getIdField(this),
        );
      }
      return baseRoute.func.call(this, ctx, params, ...args);
    },
    args: baseRoute.args,
    method: baseRoute.method,
  };
};
