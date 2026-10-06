import {
  type ControllerClass,
  RawBody,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type DataControllerCallback,
  DefaultRoutes,
} from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import { Logging } from "@antelopejs/interface-core/logging";
import type { AfterWrite, GuardFn } from "../../types/guards";
import { fetchRowForGuard } from "../data-functions";
import { TableViewMeta } from "../meta";
import { DEFAULT_ROW_ID_FIELD } from "../options";
import { normalizeToArray } from "./row-rules";

type GuardedActionName = "edit" | "delete" | "archive" | "restore" | "new";

/**
 * The values of a confirmation's fields, sent as the body of a delete,
 * archive or restore; unset when the request carried none.
 */
const parseConfirmValues = (
  raw: unknown,
): Record<string, unknown> | undefined => {
  const isEmpty =
    raw === undefined ||
    raw === null ||
    ((Buffer.isBuffer(raw) || typeof raw === "string") && raw.length === 0);
  return isEmpty ? undefined : parseGuardBody(raw);
};

/** @internal */
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
  ) => Promise<void | AfterWrite>;
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
      return guard.call(controller, ctx, { id, body, current });
    },
  },
  delete: {
    invokeGuard: async (controller, ctx, params, args, guard) => {
      const ids = normalizeToArray(
        (params as Parameters.DeleteParameters).id as string | string[],
      );
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(args.at(-1)),
      });
    },
  },
  archive: {
    invokeGuard: async (controller, ctx, params, args, guard) => {
      const ids = normalizeToArray(params as string | string[]);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(args.at(-1)),
      });
    },
  },
  restore: {
    invokeGuard: async (controller, ctx, params, args, guard) => {
      const ids = normalizeToArray(params as string | string[]);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(args.at(-1)),
      });
    },
  },
  new: {
    invokeGuard: async (controller, ctx, _params, args, guard) => {
      const body = parseGuardBody(args[0]);
      return guard.call(controller, ctx, { body });
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

/** @internal */
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

async function runAfterWrite(
  afterWrite: AfterWrite,
  actionName: GuardedActionName,
): Promise<void> {
  try {
    await afterWrite();
  } catch (error) {
    Logging.Error(
      `[dms] the ${actionName} guard's after-write work failed: ${String(error)}`,
    );
  }
}

// Their routes read no body of their own: the guard is handed the one the
// confirmation sends, read here and kept from the route.
const CONFIRM_BODY_ACTIONS: ReadonlySet<GuardedActionName> = new Set([
  "delete",
  "archive",
  "restore",
]);

/** @internal */
export const createGuardedRoute = (
  baseRoute: DataControllerCallback,
  actionName: GuardedActionName,
): DataControllerCallback => {
  const config = ACTION_GUARD_CONFIGS[actionName];
  const readsConfirmBody = CONFIRM_BODY_ACTIONS.has(actionName);
  return {
    func: async function (
      this: unknown,
      ctx: RequestContext,
      params: unknown,
      ...routeArgs: unknown[]
    ) {
      const confirmBody = readsConfirmBody ? routeArgs.pop() : undefined;
      const args = readsConfirmBody ? [confirmBody] : routeArgs;
      const guard = getGuardForAction(this, actionName);
      const afterWrite = guard
        ? await config.invokeGuard(
            this,
            ctx,
            params,
            args,
            guard,
            getIdField(this),
          )
        : undefined;
      const result = await baseRoute.func.call(this, ctx, params, ...routeArgs);
      if (afterWrite) await runAfterWrite(afterWrite, actionName);
      return result;
    },
    args: readsConfirmBody ? [...baseRoute.args, RawBody()] : baseRoute.args,
    method: baseRoute.method,
  };
};
