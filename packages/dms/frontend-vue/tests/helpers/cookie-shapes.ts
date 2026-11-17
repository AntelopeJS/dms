import type { JsonValue } from "../../layers/dms-core/app/types/json";

type JsonRecord = { [field: string]: JsonValue };

const NOT_RECORDS: readonly JsonValue[] = [null, [], "text", 5, true];

/**
 * Every single-field spoilage of `valid` (each field alone replaced by each of
 * its `wrong` values, each `required` field alone left out) plus the values
 * that are no record at all. A guard that skips one check, or accepts all,
 * lets one of them through.
 */
export function spoiledRecords(
  valid: JsonRecord,
  wrong: Readonly<Record<string, readonly JsonValue[]>>,
  required: readonly string[],
): JsonValue[] {
  return [
    ...Object.entries(wrong).flatMap(([field, values]) =>
      values.map((value) => ({ ...valid, [field]: value })),
    ),
    ...required.map((field) =>
      Object.fromEntries(
        Object.entries(valid).filter(([key]) => key !== field),
      ),
    ),
    ...NOT_RECORDS,
  ];
}
