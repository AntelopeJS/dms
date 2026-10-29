import { RawBody, type RequestContext } from "@antelopejs/interface-api";
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
import { getTableViewMetaFor } from "./meta";
import { normalizeToArray } from "./row-rules";

type GuardedActionName = "edit" | "delete" | "archive" | "restore" | "new";

/**
 * The values of a confirmation's fields, sent as the body of a delete,
 * archive or restore; unset when the request carried none.
 */
const parseConfirmValues = (
  raw: globalThis.Parameters<typeof parseGuardBody>[0],
): ReturnType<typeof parseGuardBody> | undefined => {
  const isEmpty =
    raw === undefined ||
    raw === null ||
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- RawBody may supply bytes, a string, or decoded data; this detects empty transport bodies before decoding.
    ((Buffer.isBuffer(raw) || typeof raw === "string") && raw.length === 0);
  return isEmpty ? undefined : parseGuardBody(raw);
};

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- The published permissive body decoder accepts transport values and returns module-owned fields without a fixed schema; narrowing either side would change its contract.
export const parseGuardBody = (raw: unknown): Record<string, unknown> => {
  if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString());
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This published decoder distinguishes the string transport representation from already decoded values.
  if (typeof raw === "string" && raw.length > 0) return JSON.parse(raw);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- The published decoder accepts any non-null object, including arrays, without proving an indexed row contract; preserve that unchecked compatibility behavior.
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
};

interface GuardInvocationConfig {
  // oxlint-disable-next-line eslint/max-params -- Guard adapters share six positional inputs, including the edit adapter configured row-id field.
  invokeGuard: (
    controller: globalThis.Parameters<typeof fetchRowForGuard>[0] & {
      constructor: ConstructorParameters<typeof TableViewMeta>[0];
    },
    ctx: RequestContext,
    params: globalThis.Parameters<DataControllerCallback["func"]>[1],
    args: unknown[],
    guard: GuardFn<any>,
    idField: string,
  ) => Promise<void | AfterWrite>;
}

const ACTION_GUARD_CONFIGS: Record<GuardedActionName, GuardInvocationConfig> = {
  edit: {
    // oxlint-disable-next-line eslint/max-params -- The edit adapter consumes the six positional inputs declared by GuardInvocationConfig.
    invokeGuard: async (controller, ctx, params, args, guard, idField) => {
      const id = String(params.id);
      const body = parseGuardBody(args[0]);
      const current = await fetchRowForGuard(controller, id, idField);
      throwHttpAssert(current, 404, "Not Found");
      return guard.call(controller, ctx, { id, body, current });
    },
  },
  delete: {
    invokeGuard: async (controller, ctx, params, args, guard) => {
      const ids = normalizeToArray(params.id);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(args.at(-1)),
      });
    },
  },
  archive: {
    invokeGuard: async (controller, ctx, params, args, guard) => {
      const ids = normalizeToArray(params);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(args.at(-1)),
      });
    },
  },
  restore: {
    invokeGuard: async (controller, ctx, params, args, guard) => {
      const ids = normalizeToArray(params);
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
  controller: ThisParameterType<DataControllerCallback["func"]>,
  actionName: GuardedActionName | "get",
): GuardFn<any> | undefined => {
  const meta = getTableViewMetaFor(controller);
  return meta.controllerGuards?.[actionName];
};

/** @internal */
export const guardedGetRoute: DataControllerCallback<Parameters.GetParameters> =
  DefaultRoutes.WithGetGuard(async function (ctx, current, params) {
    await getGuardForAction(this, "get")?.call(this, ctx, {
      id: params.id,
      current,
    });
  });

const getIdField = (
  controller: globalThis.Parameters<typeof fetchRowForGuard>[0] & {
    constructor: ConstructorParameters<typeof TableViewMeta>[0];
  },
): string => {
  const meta = GetMetadata(controller.constructor, TableViewMeta);
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

const CONFIRM_BODY_ACTIONS: ReadonlySet<GuardedActionName> = new Set([
  "delete",
  "archive",
  "restore",
]);

const WRITE_BODY_ACTIONS: ReadonlySet<GuardedActionName> = new Set([
  "new",
  "edit",
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
      this: globalThis.Parameters<typeof fetchRowForGuard>[0] & {
        constructor: ConstructorParameters<typeof TableViewMeta>[0];
      },
      ctx: RequestContext,
      params: globalThis.Parameters<DataControllerCallback["func"]>[1],
      ...routeArgs: unknown[]
    ) {
      const confirmBody = readsConfirmBody ? routeArgs.pop() : undefined;
      const guard = getGuardForAction(this, actionName);
      const writtenBody =
        guard && WRITE_BODY_ACTIONS.has(actionName)
          ? parseGuardBody(routeArgs[0])
          : undefined;
      const args = readsConfirmBody
        ? [confirmBody]
        : writtenBody
          ? [writtenBody, ...routeArgs.slice(1)]
          : routeArgs;
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
      const writtenArgs = writtenBody
        ? [writtenBody, ...routeArgs.slice(1)]
        : routeArgs;
      const result = await baseRoute.func.call(
        this,
        ctx,
        params,
        ...writtenArgs,
      );
      if (afterWrite) await runAfterWrite(afterWrite, actionName);
      return result;
    },
    args: readsConfirmBody ? [...baseRoute.args, RawBody()] : baseRoute.args,
    method: baseRoute.method,
  };
};
