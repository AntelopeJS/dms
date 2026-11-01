const NOT_RECORDS: readonly unknown[] = [null, [], "text", 5, true];

function without(value: Record<string, unknown>, field: string) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== field),
  );
}

/**
 * Every single-field spoilage of `valid` (each field alone replaced by each of
 * its `wrong` values, each `required` field alone left out) plus the values
 * that are no record at all. A guard that skips one check, or accepts all,
 * lets one of them through.
 */
export function spoiledShapes(
  valid: Record<string, unknown>,
  wrong: Record<string, readonly unknown[]>,
  required: readonly string[],
): unknown[] {
  return [
    ...Object.entries(wrong).flatMap(([field, values]) =>
      values.map((value) => ({ ...valid, [field]: value })),
    ),
    ...required.map((field) => without(valid, field)),
    ...NOT_RECORDS,
  ];
}
