import { isEmptyFormValue, sameFormValue } from "../unsaved-changes/formValue";

const DEFAULT_RELATION_VALUE_KEY = "_id";

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
export function mapRelationBeforeState(value: unknown, options: unknown) {
  if (!value) return value;

  const opts = options as RelationValueOptions | undefined;
  const valueKey = opts?.keyMapping?.value || DEFAULT_RELATION_VALUE_KEY;

  if (typeof value === "string" || typeof value === "number") return value;

  if (opts?.multiple && Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)[valueKey]
        : item,
    );
  }

  if (typeof value === "object" && value !== null) {
    return (value as Record<string, unknown>)[valueKey];
  }

  return value;
}

function relationIds(value: unknown, options: unknown): unknown[] {
  const ids = mapRelationBeforeState(value, options);
  return isEmptyFormValue(ids) ? [] : [ids].flat();
}

function compareIdText(left: unknown, right: unknown): number {
  return String(left).localeCompare(String(right));
}

/**
 * Two relation values are the same when they reference the same rows, whether
 * a side holds the rows the server joined or the ids the picker keeps. The
 * picks of a multiple relation are a set: their order does not count.
 */
export function sameRelationValue(
  left: unknown,
  right: unknown,
  options: unknown,
): boolean {
  const isSet = !!(options as RelationValueOptions | undefined)?.multiple;
  const comparable = (value: unknown) => {
    const ids = relationIds(value, options);
    return isSet ? ids.sort(compareIdText) : ids;
  };
  return sameFormValue(comparable(left), comparable(right));
}
