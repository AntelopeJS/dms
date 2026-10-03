// The row write behind `TableViewRoutes.Edit`, with partial-update semantics.
//
// `DefaultRoutes.Edit` from `@antelopejs/interface-data-api` hands the body to
// `Query.WriteProperties`, which assigns every writable field from it: a field
// the body leaves out is written as `undefined` and lands as null, and its
// setter runs with `undefined`. A script sending only the fields it changes
// would silently erase the others. Its `Validation.Lock` then re-locks every
// modifier field (localized, encrypted…) of the stored row, and one it did not
// just write reads as `undefined` while locked: the edit wipes it too.
//
// This route runs the same steps, with `WriteProperties` narrowed to the keys
// the body carries and only the fields it wrote locked again:
//
// | In the body               | Effect on the field |
// | ------------------------- | ------------------- |
// | key absent                | unchanged           |
// | `null` or an empty value  | cleared             |
// | a value                   | set                 |

import type { RequestContext } from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import {
  type DataControllerCallback,
  DefaultRoutes,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Query,
  Validation,
} from "@antelopejs/interface-data-api/components";
import type {
  DataAPIMeta,
  FieldData,
  WritableAccessFields,
} from "@antelopejs/interface-data-api/metadata";
import {
  getMetadata,
  lock,
  ModifiersDynamicMetadata,
  triggerEvent,
} from "@antelopejs/interface-database-decorators";
import { parseGuardBody } from "./guards";

const EDIT_ACTION = "edit";
const DEFAULT_ACCESS_KEY = "_default";

type EditBody = Record<string, unknown>;

/** A value that clears a field: `null`, an empty string or an empty list. */
export function isClearingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.length === 0;
  return Array.isArray(value) && value.length === 0;
}

/**
 * The fields mandatory for `action` that the body clears. A mandatory field
 * the body leaves out is not listed: on an edit it keeps its stored value.
 */
export function clearedMandatoryFields(
  fields: Record<string, FieldData>,
  body: EditBody,
  action: string = EDIT_ACTION,
): string[] {
  return Object.entries(fields)
    .filter(
      ([name, field]) =>
        field.mandatory?.has(action) &&
        Object.hasOwn(body, name) &&
        isClearingValue(body[name]),
    )
    .map(([name]) => name);
}

/** The writable fields of an action, narrowed to the keys the body carries. */
export function writableFieldsInBody(
  writable: WritableAccessFields,
  body: EditBody,
): WritableAccessFields {
  const inBody = ([key]: [string, FieldData]) => Object.hasOwn(body, key);
  return {
    props: writable.props.filter(inBody),
    setters: writable.setters.filter(inBody),
  };
}

/**
 * A view of the controller metadata whose `action` writes only the fields the
 * body carries. Everything else (fields, table class, target) is read through
 * to the real metadata, which stays untouched.
 */
export function scopeWritableToBody(
  meta: DataAPIMeta,
  body: EditBody,
  action: string = EDIT_ACTION,
): DataAPIMeta {
  const writable = meta.writable[action] ?? meta.writable[DEFAULT_ACCESS_KEY];
  return Object.create(meta, {
    writable: {
      value: {
        ...meta.writable,
        [action]: writableFieldsInBody(writable, body),
      },
    },
  });
}

/**
 * Locks the modifier fields (localized, encrypted…) written since the row was
 * read, with the controller's modifier keys (the request language…). A field
 * assigned while locked waits as a floating value; a field the write left
 * alone keeps its stored locked value and must not be locked again: read
 * while locked it is `undefined`, which locking would store over it.
 */
export function lockWrittenFields(
  controller: unknown,
  meta: DataAPIMeta,
  dbData: Record<string, unknown>,
): void {
  const written = Object.keys(
    getMetadata(dbData, ModifiersDynamicMetadata).floating,
  );
  if (written.length === 0) return;
  for (const [modifier, keyField] of meta.modifierKeys.entries()) {
    const key = (controller as Record<string, unknown>)[keyField];
    lock(dbData, modifier, written, key as string);
  }
}

/**
 * The stored row with the fields the body carries written over it, ready to
 * be saved: a field the body leaves out keeps its stored value.
 */
export async function writeFieldsInBody(
  controller: unknown,
  meta: DataAPIMeta,
  body: EditBody,
  stored: Record<string, unknown>,
): ReturnType<typeof Query.WriteProperties> {
  const dbData = await Query.WriteProperties(
    controller,
    scopeWritableToBody(meta, body, EDIT_ACTION),
    body,
    EDIT_ACTION,
    stored,
  );
  lockWrittenFields(controller, meta, dbData);
  return dbData;
}

/** Parses an edit request body, which must be a JSON object. */
export function parseEditBody(raw: unknown): EditBody {
  let body: unknown;
  try {
    body = parseGuardBody(raw);
  } catch {
    throwHttpAssert(false, 400, "Invalid JSON body.");
  }
  throwHttpAssert(
    typeof body === "object" && body !== null && !Array.isArray(body),
    400,
    "The edit body must be a JSON object.",
  );
  return body as EditBody;
}

/**
 * `DefaultRoutes.Edit` with partial-update semantics: only the fields the body
 * carries are validated and written. A mandatory field cleared (`null` or
 * empty) is refused; a mandatory field left out keeps its stored value.
 */
async function editFieldsInBody(
  this: unknown,
  _ctx: RequestContext,
  params: Parameters.EditParameters,
  rawBody: unknown,
): Promise<void> {
  const meta = GetDataControllerMeta(this);
  const body = parseEditBody(rawBody);
  if (!params.noMandatory) {
    const cleared = clearedMandatoryFields(meta.fields, body, EDIT_ACTION);
    throwHttpAssert(
      cleared.length === 0,
      400,
      `Missing mandatory fields: ${cleared.join(", ")}`,
    );
  }
  await Validation.ValidateTypes(meta, body);
  const model = Query.GetModel(this, meta);
  const stored = await Query.Get(model.table, params.id, params.index);
  throwHttpAssert(stored, 404, "Not Found");
  const dbData = await writeFieldsInBody(this, meta, body, stored);
  triggerEvent(dbData, "update");
  await model.table.get(params.id).update(dbData);
}

/**
 * The row write of `TableViewRoutes.Edit`: takes the arguments of
 * `DefaultRoutes.Edit` and writes only the fields the body carries.
 */
export const PartialEditRoute: DataControllerCallback = {
  ...DefaultRoutes.Edit,
  func: editFieldsInBody,
};
