const NOT_RECORDS: readonly unknown[] = [null, [], "text", 5, true];

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
    ...required.map((field) =>
      Object.fromEntries(
        Object.entries(valid).filter(([key]) => key !== field),
      ),
    ),
    ...NOT_RECORDS,
  ];
}
