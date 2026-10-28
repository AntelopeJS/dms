import { isEmptyFormValue, sameFormValue } from "../unsaved-changes/formValue";
import type {
  BeforeStateMapper,
  DataTypeValueComparer,
} from "#dms-core/app/composables/data-types/useDataType";
import { isNumber, isObject, isString } from "#dms-core/app/utils/type-check";

/** The key a related row is referenced by when `keyMapping.value` maps none. */
export const DEFAULT_RELATION_VALUE_KEY = "_id";

interface RelationKeyMapping {
  value?: string;
}

interface RelationValueOptions {
  multiple?: boolean;
  keyMapping?: RelationKeyMapping;
}

/**
 * The form state of a relation value: the id of each row it references, as
 * the picker holds it, whether the server sent the joined rows or their ids.
 */
export function mapRelationBeforeState(
  value: Parameters<BeforeStateMapper>[0],
  options: Parameters<BeforeStateMapper>[1],
) {
  if (!value) return value;

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- BeforeStateMapper erases plugin options; relation options are consumed without validation so malformed inputs retain their existing behavior.
  const opts = options as RelationValueOptions | undefined;
  const valueKey = opts?.keyMapping?.value || DEFAULT_RELATION_VALUE_KEY;

  if (isString(value) || isNumber(value)) return value;

  if (opts?.multiple && Array.isArray(value)) {
    return value.map((item) =>
      isObject(item) && item !== null ? item[valueKey] : item,
    );
  }

  if (isObject(value) && value !== null) {
    return value[valueKey];
  }

  return value;
}

function relationIds(
  value: Parameters<BeforeStateMapper>[0],
  options: Parameters<BeforeStateMapper>[1],
): ReturnType<BeforeStateMapper>[] {
  const ids = mapRelationBeforeState(value, options);
  return isEmptyFormValue(ids) ? [] : [ids].flat();
}

function compareIdText(
  left: ReturnType<typeof relationIds>[number],
  right: ReturnType<typeof relationIds>[number],
): number {
  return String(left).localeCompare(String(right));
}

/**
 * Two relation values are the same when they reference the same rows, whether
 * a side holds the rows the server joined or the ids the picker keeps. The
 * picks of a multiple relation are a set: their order does not count.
 */
export function sameRelationValue(
  left: Parameters<DataTypeValueComparer>[0],
  right: Parameters<DataTypeValueComparer>[1],
  options: Parameters<DataTypeValueComparer>[2],
): boolean {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The comparer shares the mapper's erased options contract; this assertion does not validate multiple.
  const isSet = !!(options as RelationValueOptions | undefined)?.multiple;
  const comparable = (value: Parameters<DataTypeValueComparer>[0]) => {
    const ids = relationIds(value, options);
    return isSet ? ids.sort(compareIdText) : ids;
  };
  return sameFormValue(comparable(left), comparable(right));
}

/**
 * What a relation field asks its target's `select` route for to label the
 * ids it holds: those rows alone, matched on the field's value key (the
 * route falls back to the row id when none is mapped).
 */
export interface RelationIdsQuery {
  ids: string[];
  idKey?: string;
  limit: number;
}

const isIdValue = (value: unknown): value is string | number =>
  (isString(value) && value !== "") || isNumber(value);

/**
 * The ids a relation value holds that no known row labels yet — a form whose
 * read answers the id (`"u-5"`) rather than the joined row. A joined row
 * labels itself, so only plain ids are returned, each once.
 */
export function unlabeledRelationIds(
  value: Parameters<BeforeStateMapper>[0],
  labeledIds: ReadonlySet<string>,
): string[] {
  const ids = [value].flat().filter(isIdValue).map(String);
  return [...new Set(ids)].filter((id) => !labeledIds.has(id));
}

/** The `select` query answering the rows of `ids`. */
export function relationIdsQuery(
  ids: string[],
  keyMapping?: RelationKeyMapping,
): RelationIdsQuery {
  return {
    ids,
    ...(keyMapping?.value ? { idKey: keyMapping.value } : undefined),
    limit: ids.length,
  };
}
