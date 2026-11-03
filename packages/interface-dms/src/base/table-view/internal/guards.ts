import { RawBody, type RequestContext } from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  type DataControllerCallback,
  type DataControllerInstance,
  DefaultRoutes,
} from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
import { Logging } from "@antelopejs/interface-core/logging";
import { z } from "zod";
import type { JsonValue } from "../../../json";
import type { AfterWrite, GuardFn } from "../../types/guards";
import { fetchRowForGuard } from "../data-functions";
import { TableViewMeta } from "../meta";
import { DEFAULT_ROW_ID_FIELD } from "../options";
import { getTableViewMetaFor } from "./meta";
import { normalizeToArray } from "./row-rules";

type GuardedActionName = "edit" | "delete" | "archive" | "restore" | "new";

/** The deepest nesting of arrays and objects a guard body may have, the body itself counted. */
const MAX_BODY_DEPTH = 64;

const JSON_PRIMITIVE = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** The JSON values that nest arrays and objects at most `depth` levels deep. */
const jsonValueWithin = (depth: number): z.ZodType<JsonValue> => {
  let level: z.ZodType<JsonValue> = JSON_PRIMITIVE;
  for (let nesting = 0; nesting < depth; nesting += 1) {
    level = z.union([
      JSON_PRIMITIVE,
      z.array(level),
      z.record(z.string(), level),
    ]);
  }
  return level;
};

const JSON_FIELDS = z.record(z.string(), z.unknown());

const BOUNDED_JSON_OBJECT = z.record(
  z.string(),
  jsonValueWithin(MAX_BODY_DEPTH - 1),
);

/**
 * The fields of a JSON object sent as text.
 *
 * @throws SyntaxError when `text` is not JSON, TypeError when it is JSON but
 * not an object, and an HTTP 400 result when it nests arrays and objects more
 * than {@link MAX_BODY_DEPTH} levels deep.
 */
const parseJsonObject = (text: string) => {
  const json: unknown = JSON.parse(text);
  if (!JSON_FIELDS.safeParse(json).success) {
    throw new TypeError("The JSON body is not an object");
  }
  const parsed = BOUNDED_JSON_OBJECT.safeParse(json);
  throwHttpAssert(
    parsed.success,
    400,
    `The JSON body nests more than ${MAX_BODY_DEPTH} levels deep.`,
  );
  return parsed.data;
};

/**
 * The values of a confirmation's fields, sent as the body of a delete,
 * archive or restore; unset when the request carried none.
 */
const parseConfirmValues = (raw: Buffer) =>
  raw.length === 0 ? undefined : parseJsonObject(raw.toString());

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- The published permissive body decoder accepts transport values and returns module-owned fields without a fixed schema; narrowing either side would change its contract.
export const parseGuardBody = (raw: unknown): Record<string, unknown> => {
  if (Buffer.isBuffer(raw)) return parseJsonObject(raw.toString());
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This published decoder distinguishes the string transport representation from already decoded values.
  if (typeof raw === "string" && raw.length > 0) return parseJsonObject(raw);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-unsafe-dictionary-type -- The published decoder accepts any non-null object, including arrays, without proving an indexed row contract; preserve that unchecked compatibility behavior.
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
};

/** The parameters each guarded action's route receives second. */
interface GuardedActionParams {
  edit: Parameters.EditParameters;
  delete: Parameters.DeleteParameters;
  archive: string[];
  restore: string[];
  new: Parameters.NewParameters;
}

/**
 * The controller a guarded route runs on: the instance `this` of its data
 * controller, whose class carries the table view's metadata.
 */
type GuardedController = globalThis.Parameters<typeof fetchRowForGuard>[0] & {
  constructor: ConstructorParameters<typeof TableViewMeta>[0];
};

/** The body each guarded action's route receives: a confirmation's raw bytes, or a write's parsed fields. */
interface GuardedActionBodies {
  edit: Validation.RequestBody;
  delete: Buffer;
  archive: Buffer;
  restore: Buffer;
  new: Validation.RequestBody;
}

interface GuardInvocationConfig<P, B> {
  // oxlint-disable-next-line eslint/max-params -- Guard adapters share six positional inputs, including the edit adapter configured row-id field.
  invokeGuard: (
    controller: GuardedController,
    ctx: RequestContext,
    params: P,
    body: B,
    guard: GuardFn<any>,
    idField: string,
  ) => Promise<void | AfterWrite>;
}

/** The guard adapter of each guarded action. */
type GuardInvocationConfigs = {
  [K in GuardedActionName]: GuardInvocationConfig<
    GuardedActionParams[K],
    GuardedActionBodies[K]
  >;
};

const ACTION_GUARD_CONFIGS: GuardInvocationConfigs = {
  edit: {
    // oxlint-disable-next-line eslint/max-params -- The edit adapter consumes the six positional inputs declared by GuardInvocationConfig.
    invokeGuard: async (controller, ctx, params, body, guard, idField) => {
      const id = String(params.id);
      const current = await fetchRowForGuard(controller, id, idField);
      throwHttpAssert(current, 404, "Not Found");
      return guard.call(controller, ctx, { id, body, current });
    },
  },
  delete: {
    invokeGuard: async (controller, ctx, params, body, guard) => {
      const ids = normalizeToArray(params.id);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(body),
      });
    },
  },
  archive: {
    invokeGuard: async (controller, ctx, params, body, guard) => {
      const ids = normalizeToArray(params);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(body),
      });
    },
  },
  restore: {
    invokeGuard: async (controller, ctx, params, body, guard) => {
      const ids = normalizeToArray(params);
      return guard.call(controller, ctx, {
        ids,
        values: parseConfirmValues(body),
      });
    },
  },
  new: {
    invokeGuard: async (controller, ctx, _params, body, guard) => {
      return guard.call(controller, ctx, { body });
    },
  },
};

const getGuardForAction = (
  controller: DataControllerInstance,
  actionName: GuardedActionName | "get",
): GuardFn<any> | undefined => {
  const meta = getTableViewMetaFor(controller);
  return meta.controllerGuards?.[actionName];
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

const getIdField = (controller: GuardedController): string => {
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

/**
 * `baseRoute` behind the `actionName` guard, given the body the confirmation
 * answered: the route takes it after the arguments of `baseRoute`.
 *
 * @internal
 */
export const createGuardedConfirmRoute = <
  K extends "delete" | "archive" | "restore",
  O,
  R,
>(
  baseRoute: DataControllerCallback<
    O,
    R,
    [RequestContext, GuardedActionParams[K]]
  >,
  actionName: K,
): DataControllerCallback<
  O,
  R,
  [RequestContext, GuardedActionParams[K], Buffer]
> => {
  const config: GuardInvocationConfig<GuardedActionParams[K], Buffer> =
    ACTION_GUARD_CONFIGS[actionName];
  return {
    func: async function (
      this: GuardedController,
      ctx: RequestContext,
      params: GuardedActionParams[K],
      confirmBody: Buffer,
    ) {
      const guard = getGuardForAction(this, actionName);
      const afterWrite = guard
        ? await config.invokeGuard(
            this,
            ctx,
            params,
            confirmBody,
            guard,
            getIdField(this),
          )
        : undefined;
      const result = await baseRoute.func.call(this, ctx, params);
      if (afterWrite) await runAfterWrite(afterWrite, actionName);
      return result;
    },
    args: [...baseRoute.args, RawBody()],
    method: baseRoute.method,
  };
};

/**
 * `baseRoute` behind the `actionName` guard. A guard receives the body
 * parsed by `Validation.ParseBody`, so one that is not a JSON object is
 * refused with 400 before the guard runs, and the route then writes the body
 * as the guard left it.
 *
 * @internal
 */
export const createGuardedWriteRoute = <
  K extends "new" | "edit",
  O,
  R,
  Rest extends unknown[],
>(
  baseRoute: DataControllerCallback<
    O,
    R,
    [RequestContext, GuardedActionParams[K], Validation.WrittenBody, ...Rest]
  >,
  actionName: K,
): DataControllerCallback<
  O,
  R,
  [RequestContext, GuardedActionParams[K], Validation.WrittenBody, ...Rest]
> => {
  const config: GuardInvocationConfig<
    GuardedActionParams[K],
    Validation.RequestBody
  > = ACTION_GUARD_CONFIGS[actionName];
  return {
    func: async function (
      this: GuardedController,
      ctx: RequestContext,
      params: GuardedActionParams[K],
      body: Validation.WrittenBody,
      ...rest: Rest
    ) {
      const guard = getGuardForAction(this, actionName);
      if (!guard) return baseRoute.func.call(this, ctx, params, body, ...rest);
      const writtenBody = Validation.ParseBody(body);
      const afterWrite = await config.invokeGuard(
        this,
        ctx,
        params,
        writtenBody,
        guard,
        getIdField(this),
      );
      const result = await baseRoute.func.call(
        this,
        ctx,
        params,
        writtenBody,
        ...rest,
      );
      if (afterWrite) await runAfterWrite(afterWrite, actionName);
      return result;
    },
    args: baseRoute.args,
    method: baseRoute.method,
  };
};
