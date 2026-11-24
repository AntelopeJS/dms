import type {
  ActionType,
  ExecutionCtx,
  JsonObject,
  JsonValue,
} from "@antelopejs/interface-dms-automation";
import {
  isBoolean,
  isNumber,
  isString,
} from "@antelopejs/interface-dms/utils/internal/type-check";
import { ACTIONS, TRIGGERS } from "../../automation";
import { MEMBER_ACTIONS } from "../../pages/members";

export interface ArmedTrigger {
  events: JsonObject[];
  disarm: () => Promise<void>;
}

/** A JSON value that must be an object, as node payloads and outputs are. */
export function asObject(value: JsonValue | undefined): JsonObject {
  if (
    value === undefined ||
    value === null ||
    isString(value) ||
    isNumber(value) ||
    isBoolean(value) ||
    Array.isArray(value)
  )
    throw new Error(`expected a JSON object, got ${JSON.stringify(value)}`);
  return value;
}

/** The objects of an array-valued output port. */
export function objectsOf(value: JsonValue | undefined): JsonObject[] {
  if (!Array.isArray(value))
    throw new Error(`expected an array, got ${JSON.stringify(value)}`);
  return value.map(asObject);
}

/** Activates a DMS trigger as the automation runtime does, recording what it emits. */
export async function armTrigger(
  id: string,
  config?: JsonObject,
): Promise<ArmedTrigger> {
  const trigger = TRIGGERS.find((candidate) => candidate.id === id);
  if (!trigger) throw new Error(`no trigger ${id}`);
  const events: JsonObject[] = [];
  const handle = await trigger.activate(config, (payload) =>
    events.push(asObject(payload)),
  );
  return { events, disarm: () => trigger.deactivate(handle) };
}

export function findAction(id: string): ActionType {
  const action = [...ACTIONS, ...MEMBER_ACTIONS].find(
    (candidate) => candidate.id === id,
  );
  if (!action) throw new Error(`no action ${id}`);
  return action;
}

export function stepContext(
  procedureId = "procedure",
  dryRun = false,
): ExecutionCtx {
  return {
    procedureId,
    runId: `${procedureId}-run`,
    nodeId: "node",
    dryRun,
    log: () => undefined,
  };
}

/** Runs an action as a real step, or as a test-run step with `dryRun`. */
export async function runAction(
  id: string,
  input: JsonObject,
  options: { dryRun?: boolean; procedureId?: string } = {},
): Promise<JsonObject> {
  const action = findAction(id);
  const ctx = stepContext(options.procedureId, options.dryRun);
  const output =
    options.dryRun && action.dryRun
      ? await action.dryRun(input, ctx)
      : await action.execute(input, ctx);
  if (!output) throw new Error(`${id} resolved with no output`);
  return output;
}
